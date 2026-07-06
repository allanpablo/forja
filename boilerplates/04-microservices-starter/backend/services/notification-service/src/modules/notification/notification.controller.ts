import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Logger,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationRequest, RequestId, generateRequestId, createSuccessResponse } from 'shared';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger('NotificationController');

  constructor(private notificationService: NotificationService) {}

  @Post('email')
  @HttpCode(202)
  async sendEmail(
    @Body() body: NotificationRequest,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!body.userId || !body.recipient || !body.body) {
      throw new BadRequestException('userId, recipient, and body are required');
    }

    const notification = await this.notificationService.sendEmail(body);

    return createSuccessResponse(
      {
        notificationId: notification.notificationId,
        status: notification.status,
        createdAt: notification.createdAt,
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Post('push')
  @HttpCode(202)
  async sendPush(
    @Body() body: NotificationRequest,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!body.userId || !body.body) {
      throw new BadRequestException('userId and body are required');
    }

    const notification = await this.notificationService.sendPush(body);

    return createSuccessResponse(
      {
        notificationId: notification.notificationId,
        status: notification.status,
        createdAt: notification.createdAt,
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Get(':notificationId')
  async getStatus(
    @Param('notificationId') notificationId: string,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    const notification = await this.notificationService.getNotificationStatus(notificationId);

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    return createSuccessResponse(notification, requestId, Date.now() - startTime);
  }

  @Get()
  async listNotifications(
    @Query('userId') userId: string,
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0',
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const { notifications, total } = await this.notificationService.listNotifications(
      userId,
      parseInt(limit),
      parseInt(offset),
    );

    return createSuccessResponse(
      {
        data: notifications,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total,
        },
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Get('templates')
  async getTemplates(@RequestId() requestId: string = generateRequestId()) {
    const startTime = Date.now();

    const templates = [
      {
        templateId: 'tpl-001',
        name: 'welcome_email',
        type: 'email',
        subject: 'Welcome {{name}}!',
        body: this.notificationService.getTemplate('welcome_email'),
      },
      {
        templateId: 'tpl-002',
        name: 'password_reset',
        type: 'email',
        subject: 'Reset your password',
        body: this.notificationService.getTemplate('password_reset'),
      },
      {
        templateId: 'tpl-003',
        name: 'email_verification',
        type: 'email',
        subject: 'Verify your email',
        body: this.notificationService.getTemplate('email_verification'),
      },
    ];

    return createSuccessResponse(templates, requestId, Date.now() - startTime);
  }

  @Get('health')
  async health() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      checks: {
        service: { status: 'UP' },
      },
    };
  }
}
