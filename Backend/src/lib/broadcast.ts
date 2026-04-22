type BroadcastFn = (message: string) => void;

let _broadcast: BroadcastFn | null = null;

export function registerBroadcast(fn: BroadcastFn) {
  _broadcast = fn;
}

export function broadcast(data: object) {
  if (_broadcast) {
    _broadcast(JSON.stringify(data));
  }
}
