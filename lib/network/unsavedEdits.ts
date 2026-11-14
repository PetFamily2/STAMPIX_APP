// Process-local registrations; no form data or identity is retained.
let count = 0;

export function hasUnsavedEdits() {
  return count > 0;
}

export function registerUnsavedEdits() {
  count += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      count -= 1;
    }
  };
}
