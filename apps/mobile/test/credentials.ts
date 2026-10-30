import type {Journal} from '../src/session/Session';
export function memoryCredentials(): Journal & {data: Map<string,string>} {
  const data = new Map<string,string>();
  return {data, read: async key => data.get(key) ?? null, write: async (key,value) => {data.set(key,value);}, remove: async key => {data.delete(key);}};
}
