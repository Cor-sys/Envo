// Tiny wrapper around the Vibration API. iOS Safari ignores it entirely
// (Apple does not implement navigator.vibrate); Android Chrome respects it.
// Free win on Android, no-op on iOS — call wherever a tap feels load-bearing.

export function tap()        { try { navigator.vibrate?.(15); } catch { /* noop */ } }
export function success()    { try { navigator.vibrate?.([20, 40, 20]); } catch { /* noop */ } }
export function error()      { try { navigator.vibrate?.([50, 50, 50]); } catch { /* noop */ } }
