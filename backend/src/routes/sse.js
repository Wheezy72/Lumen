import express from 'express';
import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export const sseInit = (app) => {
  app.set('sseEmitter', emitter);
};

export const sseRouter = express.Router();

sseRouter.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  const onEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on('scan-update', onEvent);

  req.on('close', () => {
    emitter.removeListener('scan-update', onEvent);
  });
});

export const publishScanUpdate = (app, data) => {
  const em = app.get('sseEmitter') || emitter;
  em.emit('scan-update', data);
};