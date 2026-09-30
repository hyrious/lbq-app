import { createInvoke, element } from 'app-file://shared/renderer.ts';
import type { OpenItem, Repository, ReposRpc } from '../common/common.ts';

const invoke = createInvoke<ReposRpc>();

export class OpenItemsPanel {
  private readonly panel = element('dialog', 'open-items-panel');
  private readonly title = element('strong');
  private readonly content = element('div', 'open-items-content');
  private repo: Repository | undefined;
  private version = 0;

  constructor(root: HTMLElement) {
    const header = element('div', 'open-items-header');
    const close = element('button', 'icon-button');
    close.type = 'button';
    close.title = '返回';
    close.setAttribute('aria-label', '返回');
    const back = document.createElement('iconify-icon');
    back.setAttribute('icon', 'octicon:arrow-left-16');
    back.setAttribute('aria-hidden', 'true');
    close.append(back);
    close.onclick = () => this.panel.close();
    this.title.id = 'repos-open-items-title';
    this.panel.setAttribute('aria-labelledby', this.title.id);
    header.append(close, this.title);
    this.panel.append(header, this.content);
    root.append(this.panel);
    this.panel.addEventListener('click', event => {
      if (event.target != this.panel) return;
      const bounds = this.panel.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        this.panel.close();
      }
    });
    this.panel.addEventListener('close', () => { this.version++; });
  }

  open(repo: Repository) {
    this.repo = repo;
    this.title.textContent = repo.name;
    this.content.replaceChildren();
    this.panel.showModal();
    void this.load();
  }

  private async load() {
    if (!this.repo) return;
    const version = ++this.version;
    this.content.setAttribute('aria-busy', 'true');
    const message = element('p', 'open-items-message', '正在加载…');
    this.content.replaceChildren(message);
    try {
      const items = await invoke('reposOpenItems', this.repo.path);
      if (version != this.version) return;
      this.content.replaceChildren();
      if (!items.length) this.content.append(element('p', 'open-items-message', '没有 Open PR 或 Issue'));
      this.renderItems(items);
    } catch {
      if (version == this.version) message.textContent = '加载失败，请重新打开重试';
    } finally {
      if (version == this.version) {
        this.content.removeAttribute('aria-busy');
      }
    }
  }

  private renderItems(items: OpenItem[]) {
    for (const item of items) {
      const link = element('a', 'open-item');
      link.href = item.url;
      const kind = item.isPullRequest ? item.isDraft ? 'Draft PR' : 'PR' : 'Issue';
      link.setAttribute('aria-label', `${kind} #${item.number} ${item.title}`);
      link.title = `${item.author}\n${new Date(item.updatedAt).toLocaleString()}`;
      const icon = document.createElement('iconify-icon');
      const name = item.isPullRequest ? item.isDraft ? 'git-pull-request-draft-16' : 'git-pull-request-16' : 'issue-opened-16';
      icon.className = `notification-icon ${item.isDraft ? 'draft' : 'open'}`;
      icon.setAttribute('icon', `octicon:${name}`);
      icon.setAttribute('aria-hidden', 'true');
      const content = element('span', 'notification-content');
      const meta = element('span', 'notification-repo', `${this.repo!.name} #${item.number}`);
      const title = element('strong', 'notification-title', item.title);
      content.append(meta, title);
      link.append(icon, content);
      link.onclick = async event => {
        event.preventDefault();
        try {
          await invoke('reposOpenItem', item.url);
        } catch {
          meta.textContent = '无法打开链接，请重试';
        }
      };
      this.content.append(link);
    }
  }
}
