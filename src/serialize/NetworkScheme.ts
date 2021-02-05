import 'reflect-metadata';
import { SerializableCompoundType, SerializableDataType } from './BaseTypes';
import Serializable from './Serializable';

const networkMetaKey = 'netScheme';

interface NetSchemeEntry {
  type: SerializableCompoundType<any> | SerializableDataType<any> | Serializable,
  modified: boolean
}

type NetScheme = Map<string, NetScheme>
interface NetScheme {
  [key: string]: NetSchemeEntry
}

export function getNetScheme(target: any): NetScheme {
  return Reflect.getMetadata(networkMetaKey, target);
}

function setNetScheme(target: any, scheme: NetScheme): void {
  return Reflect.defineMetadata(networkMetaKey, scheme, target);
}

function updateNetScheme(target: any, update: (last: NetScheme) => NetScheme) {
  return setNetScheme(target, update((getNetScheme(target) || {})));
}

export function resetModified(target) {
  const meta = getNetScheme(target);
  for (const key in meta) {
    meta[key].modified = false;
  }
  Reflect.defineMetadata(networkMetaKey, meta, target);
}

export function networked<T>(type?: SerializableDataType<T>) {
  return function (target: T | Serializable, key: string) {
    const changeDetector = {
      get(t, k) {
        if (k === 'isProxy') return true;

        const prop = t[k];
        if (typeof t[k] === 'undefined') return undefined;
        if (!prop.isProxy && typeof prop === 'object') {
          t[k] = new Proxy(prop, changeDetector)
        }
        return t[k];
      },
      set(t, k, val) {
        updateNetScheme(
          target,
          ls => ({ ...ls, [key]: { ...ls[key], modified: true } })
        )
        t[k] = val;
        return true;
      }
    }

    updateNetScheme(
      target,
      (ls) => ({ ...ls, [key]: { type, modified: false } })
    )
    const original = target[key];
    target[key] = new Proxy(original, changeDetector)
  }
}
