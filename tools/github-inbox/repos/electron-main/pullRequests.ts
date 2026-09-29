import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PullRequest, Repository } from '../common/common.ts';

const exec = promisify(execFile);

interface CacheEntry {
  key: string;
  checkedAt: number;
  pending: boolean;
  value: PullRequest | undefined;
}

export class PullRequests {
  private readonly entries = new Map<string, CacheEntry>();

  get(repo: Repository): PullRequest | undefined {
    if (repo.error || !repo.remote || !repo.branch || repo.branch == '(detached)') return undefined;
    const key = JSON.stringify([repo.remote, repo.branch, repo.upstream]);
    let entry = this.entries.get(repo.path);
    if (!entry || entry.key != key) {
      entry = { key, checkedAt: 0, pending: false, value: undefined };
      this.entries.set(repo.path, entry);
    }
    if (!entry.pending && Date.now() - entry.checkedAt >= 60000) {
      entry.pending = true;
      void this.refresh(repo, entry);
    }
    return entry.value;
  }

  private async refresh(repo: Repository, entry: CacheEntry): Promise<void> {
    try {
      const { stdout } = await exec('gh', ['pr', 'view', '--json', 'number,title,url,isDraft,state,headRefName'], {
        cwd: repo.path, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' }
      });
      const value = JSON.parse(stdout);
      const remoteBranch = repo.upstream.slice(repo.upstream.indexOf('/') + 1);
      const matchingBranch = value.headRefName == repo.branch || value.headRefName == remoteBranch;
      entry.value = value.state == 'OPEN' && matchingBranch && typeof value.number == 'number'
        && typeof value.title == 'string' && typeof value.url == 'string' && typeof value.isDraft == 'boolean'
        ? { number: value.number, title: value.title, url: value.url, isDraft: value.isDraft }
        : undefined;
    } catch {
      // A branch without a PR and an unavailable GitHub connection both hide the button.
      entry.value = undefined;
    } finally {
      entry.pending = false;
      entry.checkedAt = Date.now();
    }
  }
}
