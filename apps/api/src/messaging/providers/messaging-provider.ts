export interface MessagingProvider {
  send(to: string, body: string, title?: string): Promise<{ ok: boolean; id?: string }>;
}
