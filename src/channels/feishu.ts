import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';

import { logger } from '../logger.js';
import {
  Channel,
  NewMessage,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface FeishuChannelOpts {
  appId: string;
  appSecret: string;
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class FeishuChannel implements Channel {
  name = 'feishu';

  private client: Client;
  private wsClient: WSClient | null = null;
  private opts: FeishuChannelOpts;
  private connected = false;

  constructor(opts: FeishuChannelOpts) {
    this.opts = opts;
    this.client = new Client({
      appId: opts.appId,
      appSecret: opts.appSecret,
      domain: 'https://open.feishu.cn',
    });
  }

  async connect(): Promise<void> {
    logger.info('Connecting to Feishu...');

    // Create EventDispatcher to handle incoming messages
    const eventDispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        await this.handleMessage(data);
      },
    });

    // Create WSClient with app credentials
    this.wsClient = new WSClient({
      appId: this.opts.appId,
      appSecret: this.opts.appSecret,
      domain: 'https://open.feishu.cn',
    });

    // Start the WebSocket connection with event handler
    this.wsClient.start({
      eventDispatcher,
    });

    this.connected = true;
    logger.info('Feishu channel connected');
  }

  private async handleMessage(data: any): Promise<void> {
    try {
      // Debug log for all received messages
      logger.info({ data: JSON.stringify(data) }, 'Feishu: received message event raw');

      const message = data.message;
      const sender = data.sender;
      const chatType = data.chat_type;
      const messageId = message.message_id;

      logger.info({ chatType, senderOpenId: sender?.sender_id?.open_id, messageId }, 'Feishu: parsed message info');

      // Get message content (text only for now)
      let content = '';
      const messageType = message.message_type;

      if (messageType === 'text') {
        const contentObj = JSON.parse(message.content);
        content = contentObj.text || '';
      } else if (messageType === 'post') {
        // Handle post messages (rich text)
        const contentObj = JSON.parse(message.content);
        // Extract text from post content
        const post = contentObj.post;
        if (post && post.zh_cn) {
          content = this.extractTextFromPost(post.zh_cn);
        }
      }

      // Skip empty messages
      if (!content) return;

      // Build chat JID - both p2p and group use chat_id
      // p2p (private chat): chat_id starts with "oc_"
      // group: chat_id starts with "oc_"
      const chatJid = `feishu:${message.chat_id}`;

      logger.info({ chatJid, registeredJids: Object.keys(this.opts.registeredGroups()) }, 'Feishu: chat JID info');

      // Get timestamp
      const timestamp = new Date(message.create_time * 1000).toISOString();

      // Get sender info
      const senderName = sender.sender_id.name || 'Unknown';
      const senderId = sender.sender_id.open_id || '';

      // Store chat metadata
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'feishu', chatType === 'group');

      // Only deliver full message for registered chats
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(`Feishu: ignoring message from unregistered chat ${chatJid}`);
        return;
      }

      // Create NewMessage object
      const newMessage: NewMessage = {
        id: messageId,
        chat_jid: chatJid,
        sender: senderId,
        sender_name: senderName,
        content: content,
        timestamp: timestamp,
        is_from_me: false,
        is_bot_message: false,
      };

      this.opts.onMessage(chatJid, newMessage);
    } catch (error) {
      logger.error({ error }, 'Error handling Feishu message');
    }
  }

  private extractTextFromPost(post: any): string {
    let text = '';
    const content = post.content || [];
    for (const block of content) {
      for (const item of block) {
        if (item.tag === 'text') {
          text += item.text;
        } else if (item.tag === 'at') {
          text += `@${item.mention_name || 'user'} `;
        }
      }
    }
    return text;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // Extract ID from JID
    const id = jid.replace('feishu:', '');

    // Determine if it's a chat_id (group) or open_id (personal)
    // chat_id starts with 'oc_', open_id starts with 'ou_'
    const isChatId = id.startsWith('oc_');
    const receiveIdType = isChatId ? 'chat_id' : 'open_id';

    try {
      // Send text message using Feishu API
      await this.client.im.message.create({
        params: {
          receive_id_type: receiveIdType,
        },
        data: {
          receive_id: id,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
      logger.info(`Feishu: message sent to ${jid} (type: ${receiveIdType})`);
    } catch (error) {
      logger.error({ jid, error }, 'Feishu: failed to send message');
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('feishu:');
  }

  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
      this.connected = false;
      logger.info('Feishu channel disconnected');
    }
  }
}
