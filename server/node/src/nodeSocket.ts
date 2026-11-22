/**
 * Una conexion de `ws` (la libreria de WebSocket de Node) como conexion de una sala. Lo que se sabe
 * de ella desde que saludo va en el objeto: en Node no hay hibernacion, la conexion vive lo que
 * vive el proceso.
 */
import { WebSocket } from 'ws';
import type { Attachment, RoomSocket } from '../../src/roomHost';

export class NodeSocket implements RoomSocket {
  private attached: Attachment | null = null;

  constructor(private readonly socket: WebSocket) {}

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(text: string): void {
    this.socket.send(text);
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason);
  }

  attachment(): Attachment | null {
    return this.attached;
  }

  attach(attachment: Attachment): void {
    this.attached = attachment;
  }
}
