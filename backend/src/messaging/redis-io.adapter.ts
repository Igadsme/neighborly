import { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { SocketRedis } from './socket-redis'

/**
 * Attaches the Redis adapter when SocketRedis opened a pub/sub pair.
 * The gateway's JWT handshake is unchanged: this class only chooses
 * how rooms are shared between processes.
 */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly sockets: SocketRedis
  ) {
    super(app)
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options)
    const adapter = this.sockets.adapter()
    if (adapter) server.adapter(adapter)
    return server
  }
}
