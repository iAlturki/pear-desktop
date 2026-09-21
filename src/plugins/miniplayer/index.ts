import { createPlugin } from '@/utils';

import { onConfigChange, onMainLoad } from './main';

export type MiniplayerPluginConfig = {
  enabled: boolean;
};

export default createPlugin({
  name: () => 'Desktop Miniplayer',
  description: () =>
    'Sleek bottom-right hovering miniplayer widget with live music info and controls',
  restartNeeded: false,
  config: {
    enabled: true,
  } as MiniplayerPluginConfig,
  backend: {
    start: onMainLoad,
    onConfigChange,
  },
});
