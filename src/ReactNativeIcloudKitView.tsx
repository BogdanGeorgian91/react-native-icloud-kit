import { requireNativeView } from 'expo';
import * as React from 'react';

import { ReactNativeIcloudKitViewProps } from './ReactNativeIcloudKit.types';

const NativeView: React.ComponentType<ReactNativeIcloudKitViewProps> =
  requireNativeView('ReactNativeIcloudKit');

export default function ReactNativeIcloudKitView(props: ReactNativeIcloudKitViewProps) {
  return <NativeView {...props} />;
}
