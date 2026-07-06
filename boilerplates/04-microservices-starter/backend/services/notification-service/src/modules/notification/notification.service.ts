import { Injectable, Logger } from '@nestjs/common';
import { NotificationRequest, Notification } from 'shared';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');
  private notifications: Map<string, Notification> = new Map();
  private emailTemplates = {
    welcome_email: 'Welcome {{name}}!',
    password_reset: 'Reset your password: {{resetLink}}',
    email_verification: 'Verify your email with code: {{code}}',
  };

  async sendEmail(request: NotificationRequest): Promise<Notification> {
    const notificationId = `notif-${Date.now()}`;
    const now = new Date().toISOString();

    const notification: Notification = {
      notificationId,
      userId: request.userId,
      type: 'email',
      status: 'sent',
      recipient: request.recipient,
      subject: request.subject || 'Notification',
      body: request.body,
      retries: 0,
      createdAt: now,
      sentAt: now,
    };

    this.notifications.set(notificationId, notification);
    this.logger.log(`Email sent to ${request.recipient}`);

    return notification;
  }

  async sendPush(request: NotificationRequest): Promise<Notification> {
    const notificationId = `notif-${Date.now()}`;
    const now = new Date().toISOString();

    const notification: Notification = {
      notificationId,
      userId: request.userId,
      type: 'push',
      status: 'sent',
      recipient: request.recipient,
      body: request.body,
      retries: 0,
      createdAt: now,
      sentAt: now,
    };

    this.notifications.set(notificationId, notification);
    this.logger.log(`Push notification sent to user ${request.userId}`);

    return notification;
  }

  async getNotificationStatus(notificationId: string): Promise<Notification | null> {
    return this.notifications.get(notificationId) || null;
  }

  async listNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ notifications: Notification[]; total: number }> {
    const userNotifications = Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId,
    );

    const total = userNotifications.length;
    const paginatedNotifications = userNotifications.slice(offset, offset + limit);

    return {
      notifications: paginatedNotifications,
      total,
    };
  }

  getTemplate(templateName: string): string {
    return this.emailTemplates[templateName] || '';
  }

  renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return rendered;
  }
}
