import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxService } from './outbox.service';

/**
 * Skeleton outbox relay — polls unpublished events and marks them published.
 * M1 stubs consumer enqueue; BullMQ fan-out arrives in later milestones.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly outbox: OutboxService) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, 5000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const events = await this.outbox.claimUnpublished(50);
      if (events.length === 0) {
        return;
      }
      this.logger.debug(`Relaying ${String(events.length)} outbox event(s)`);
      // Stub: enqueue to BullMQ in later milestones
      await this.outbox.markPublished(events.map((e) => e.id));
    } catch (err) {
      this.logger.error({ err }, 'Outbox relay failed');
    } finally {
      this.running = false;
    }
  }
}
