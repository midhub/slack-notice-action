import * as core from '@actions/core';
import * as github from '@actions/github';
import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook';

export interface With {
  status: string;
  mention: string;
  text: string;
  title: string;
  only_mention_fail: string;
  username: string;
  icon_emoji: string;
  icon_url: string;
  channel: string;
}

const groupMention = ['here', 'channel'];

export class Client {
  private webhook: IncomingWebhook;
  private github?: github.GitHub;
  private with: With;
  private run_id: string;

  constructor(
    props: With,
    token?: string,
    webhookUrl?: string,
    github_run_id?: string,
  ) {
    this.with = props;

    if (props.status !== 'custom') {
      if (token === undefined) {
        throw new Error('Specify secrets.GITHUB_TOKEN');
      }
      this.github = new github.GitHub(token);
    }

    if (webhookUrl === undefined) {
      throw new Error('Specify secrets.SLACK_WEBHOOK_URL');
    }

    if (github_run_id === undefined) {
      throw new Error('Specify secrets.GITHUB_RUN_ID');
    }
    this.webhook = new IncomingWebhook(webhookUrl);
    this.run_id = process.env.GITHUB_RUN_ID as string;
  }

  async success() {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'good';
    template.text += this.textSuccess;

    return template;
  }

  async fail() {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'danger';
    template.text += this.mentionText(this.with.only_mention_fail);
    template.text += this.textFail;

    return template;
  }

  async cancel() {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'warning';
    template.text += this.textCancel;

    return template;
  }

  async send(payload: string | IncomingWebhookSendArguments) {
    core.debug(JSON.stringify(github.context, null, 2));
    await this.webhook.send(payload);
    core.debug('send message');
  }

  private async payloadTemplate() {
    const text = this.mentionText(this.with.mention);
    const { username, icon_emoji, icon_url, channel } = this.with;

    return {
      text,
      username,
      icon_emoji,
      icon_url,
      channel,
      attachments: [
        {
          color: '',
          // title: this.title,
          fields: await this.fields(),
        },
      ],
    };
  }

  private async fields() {
    if (this.github === undefined) {
      throw Error('Specify secrets.GITHUB_TOKEN');
    }
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;
    const commit = await this.github.repos.getCommit({ owner, repo, ref: sha });
    const { author } = commit.data.commit;

    return [
      {
        title: 'Repository',
        value: this.repositoryLink,
        short: true,
      },
      {
        title: 'Author',
        value: `${author.name}<${author.email}>`,
        short: true,
      },
      {
        title: 'Ref, Commit Link',
        value: `${github.context.ref} ${this.commitLink}`,
        short: true,
      },
      {
        title: 'Workflow Link',
        value: this.workflowLink,
        short: true,
      },
      {
        title: 'Message',
        value: commit.data.commit.message,
        short: false,
      },
    ];
  }

  private get textSuccess() {
    if (this.with.text !== '') {
      return this.with.text;
    }
    return 'A GitHub Action has succeeded';
  }

  private get textFail() {
    if (this.with.text !== '') {
      return this.with.text;
    }
    return 'A GitHub Action has failed';
  }

  private get textCancel() {
    if (this.with.text !== '') {
      return this.with.text;
    }
    return 'A GitHub Action has been cancelled';
  }

  // private get title() {
  //   if (this.with.title !== '') {
  //     return this.with.title;
  //   }
  //   return github.context.workflow;
  // }

  private get commitLink() {
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;

    return `<https://github.com/${owner}/${repo}/commit/${sha}|${sha.toString().slice(-7)}>`;
  }

  private get repositoryLink() {
    const { owner, repo } = github.context.repo;

    return `<https://github.com/${owner}/${repo}|${owner}/${repo}>`;
  }

  private get workflowLink() {
    const { owner, repo } = github.context.repo;

    return `<https://github.com/${owner}/${repo}/actions/runs/${this.run_id}|${github.context.workflow}>`;
  }

  private mentionText(mention: string) {
    const normalized = mention.replace(/ /g, '');
    if (groupMention.includes(normalized)) {
      return `<!${normalized}> `;
    } else if (normalized !== '') {
      const text = normalized
        .split(',')
        .map(userId => `<@${userId}>`)
        .join(' ');
      return `${text} `;
    }
    return '';
  }
}
