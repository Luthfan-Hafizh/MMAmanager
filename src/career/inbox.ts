// The inbox: messages to the player, some of them decisions that hold the calendar.

import type { Message, World } from "../model/types";
import { nextId } from "../world/core";

export function notify(w: World, m: Omit<Message, "id" | "day" | "read"> & { day?: number; read?: boolean }): Message {
  const msg: Message = { id: nextId(w, "m"), day: m.day ?? w.day, read: m.read ?? false, ...m };
  w.inbox.unshift(msg);
  if (w.inbox.length > 400) {
    // Drop the oldest messages that need nothing.
    for (let k = w.inbox.length - 1; k >= 0 && w.inbox.length > 360; k--) {
      if (!w.inbox[k].needs || w.inbox[k].done) w.inbox.splice(k, 1);
    }
  }
  return msg;
}

export function blocking(w: World): Message[] {
  return w.inbox.filter((m) => m.needs && !m.done);
}

export function unread(w: World): number {
  return w.inbox.reduce((n, m) => n + (m.read ? 0 : 1), 0);
}

export function closeMessages(w: World, ref: string, done: string): void {
  for (const m of w.inbox) if (m.ref === ref && !m.done) {
    m.done = done;
    m.needs = false;
    m.read = true;
  }
}
