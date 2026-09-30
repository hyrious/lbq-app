import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OpenCounts, OpenItem, Repository } from '../common/common.ts';

const exec = promisify(execFile);

interface CacheEntry {
  checkedAt: number;
  pending: boolean;
  value: OpenCounts | undefined;
}

function githubRepository(repo: Repository): string {
  if (repo.error) return '';
  const match = /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+?)\/?$/.exec(repo.remote);
  return match ? match[1].replace(/\.git$/, '') : '';
}

async function api(args: string[]): Promise<any> {
  const { stdout } = await exec('gh', ['api', '--hostname', 'github.com', ...args], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' }
  });
  return JSON.parse(stdout);
}

export class OpenItems {
  private readonly entries = new Map<string, CacheEntry>();

  get(repo: Repository): OpenCounts | undefined {
    const name = githubRepository(repo);
    if (!name) return undefined;
    let entry = this.entries.get(name);
    if (!entry) {
      entry = { checkedAt: 0, pending: false, value: undefined };
      this.entries.set(name, entry);
    }
    if (!entry.pending && Date.now() - entry.checkedAt >= 60000) {
      entry.pending = true;
      void this.refresh(name, entry);
    }
    return entry.value;
  }

  private async refresh(name: string, entry: CacheEntry): Promise<void> {
    try {
      const [owner, repo] = name.split('/');
      const response = await api(['graphql', '-f', 'query=query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){pullRequests(states:OPEN){totalCount} issues(states:OPEN){totalCount}}}',
        '-f', `owner=${owner}`, '-f', `repo=${repo}`]);
      const value = response.data.repository;
      if (typeof value?.pullRequests?.totalCount != 'number' || typeof value?.issues?.totalCount != 'number') {
        throw new Error('无法读取数量');
      }
      entry.value = { pulls: value.pullRequests.totalCount, issues: value.issues.totalCount };
    } catch {
      // Keep the last successful counts when GitHub is unavailable.
    } finally {
      entry.pending = false;
      entry.checkedAt = Date.now();
    }
  }

  async list(repo: Repository): Promise<OpenItem[]> {
    const name = githubRepository(repo);
    if (!name) throw new Error('无法识别 GitHub 仓库');
    const pages = await api([`repos/${name}/issues?state=open&sort=updated&direction=desc&per_page=100`, '--paginate', '--slurp']);
    const items: OpenItem[] = pages.flat().map((value: any) => {
      if (typeof value.number != 'number' || typeof value.title != 'string' || typeof value.html_url != 'string'
          || typeof value.updated_at != 'string') throw new Error('无法读取列表');
      return {
        number: value.number, title: value.title, url: value.html_url,
        author: value.user?.login ?? '', updatedAt: value.updated_at,
        isPullRequest: !!value.pull_request, isDraft: value.draft == true
      };
    });
    return items;
  }
}
