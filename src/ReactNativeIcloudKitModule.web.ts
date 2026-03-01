import { registerWebModule, NativeModule } from 'expo';

import { ReactNativeIcloudKitModuleEvents } from './ReactNativeIcloudKit.types';

class ReactNativeIcloudKitModule extends NativeModule<ReactNativeIcloudKitModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ReactNativeIcloudKitModule, 'ReactNativeIcloudKitModule');
