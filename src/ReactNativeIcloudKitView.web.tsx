import * as React from 'react';

import { ReactNativeIcloudKitViewProps } from './ReactNativeIcloudKit.types';

export default function ReactNativeIcloudKitView(props: ReactNativeIcloudKitViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
