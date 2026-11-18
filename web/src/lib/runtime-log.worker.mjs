import { formatRuntimeLog } from './runtime-log.mjs';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ formatted: formatRuntimeLog(data) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
