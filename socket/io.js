let ioInstance = null;

function setIo(io, { force = false } = {}) {
  const looksLikeIoServer = io && typeof io.of === 'function' && io.sockets;
  if (!looksLikeIoServer) {
    throw new Error('Invalid Socket.IO instance');
  }
  if (ioInstance && !force) {
    throw new Error('Socket.io already initialized');
  }
  ioInstance = io;
}

function getIo() {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized - call init first');
  }
  return ioInstance;
}

module.exports = {
  setIo,
  getIo
};
