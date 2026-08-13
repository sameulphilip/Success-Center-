import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MessagingService } from './messaging.service';

@Processor('messaging')
export class MessagingProcessor extends WorkerHost {
  constructor(private readonly messaging: MessagingService) {
    super();
  }

  async process(job: Job<{ jobId: string }>) {
    await this.messaging.processJob(job.data.jobId);
  }
}
