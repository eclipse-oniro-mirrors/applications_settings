/**
 * Copyright (c) 2024 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import deviceInfo from '@ohos.deviceInfo';
import BaseSettingsController from '../../../../../../../common/component/src/main/ets/default/controller/BaseSettingsController';
import BluetoothModel, { BondState, ProfileConnectionState } from '../../model/bluetoothImpl/BluetoothModel';
import BluetoothDevice from '../../model/bluetoothImpl/BluetoothDevice';
import Log from '../../../../../../../common/utils/src/main/ets/default/baseUtil/LogDecorator';
import ConfigData from '../../../../../../../common/utils/src/main/ets/default/baseUtil/ConfigData';
import ISettingsController from '../../../../../../../common/component/src/main/ets/default/controller/ISettingsController';
import LogUtil from '../../../../../../../common/utils/src/main/ets/default/baseUtil/LogUtil';
import AboutDeviceModel from '../../model/aboutDeviceImpl/AboutDeviceModel'
import { emitter } from '@kit.BasicServicesKit';
import constant from '@ohos.bluetooth.constant';

const deviceTypeInfo = deviceInfo.deviceType;
const DISCOVERY_DURING_TIME: number = 30000; // 30'
const DISCOVERY_INTERVAL_TIME: number = 3000; // 3'
const DISCOVERY_DEBOUNCE_TIME: number = 500;

export default class BluetoothDeviceController extends BaseSettingsController {
  private TAG = ConfigData.TAG + 'BluetoothDeviceController '

  //state
  private isOn: boolean = false;
  private enabled: boolean = false;

  // paired devices
  private pairedDevices: BluetoothDevice[] = [];

  // available devices
  private isDeviceDiscovering: boolean = false;
  private availableDevices: BluetoothDevice[] = [];
  private pairPinCode: string = '';
  private discoveryStartTimeoutId: number = 0;
  private discoveryStopTimeoutId: number = 0;
  private debounceTimer: number = 0;
  private eventData: emitter.EventData = {};

  initData(): ISettingsController {
    LogUtil.log(this.TAG + 'start to initData bluetooth');
    super.initData();
    let isOn = BluetoothModel.isStateOn();
    LogUtil.log(this.TAG + 'initData bluetooth state isOn ' + isOn + ', typeof isOn = ' + typeof (isOn))
    if (isOn) {
      this.refreshPairedDevices();
    }

    LogUtil.log(this.TAG + 'initData save value to app storage. ')
    this.isOn = new Boolean(isOn).valueOf()
    this.enabled = true

    AppStorage.SetOrCreate('bluetoothIsOn', this.isOn);
    AppStorage.SetOrCreate('bluetoothToggleEnabled', this.enabled);
    AppStorage.SetOrCreate('bluetoothAvailableDevices', this.availableDevices);

    return this;
  }

  subscribe(): ISettingsController {
    LogUtil.log(this.TAG + 'subscribe bluetooth state isOn ' + this.isOn)
    this.subscribeStateChange();
    this.subscribeBluetoothDeviceFind();
    this.subscribeBondStateChange();
    this.subscribeDeviceConnectStateChange();
    BluetoothModel.subscribePinRequired((pinRequiredParam: {
      deviceId: string;
      pinCode: string;
    }) => {
      LogUtil.log(this.TAG + 'bluetooth subscribePinRequired callback. pinRequiredParam = ' + pinRequiredParam.pinCode);
      let pairData = this.getAvailableDevice(pinRequiredParam.deviceId);
      this.pairPinCode = pinRequiredParam.pinCode;
      AppStorage.SetOrCreate('pairData', pairData);
      AppStorage.SetOrCreate('pinRequiredParam', pinRequiredParam);
    });
    return this;
  }

  unsubscribe(): ISettingsController {
    LogUtil.log(this.TAG + 'start to unsubscribe bluetooth');
    this.stopBluetoothDiscovery();

    if (this.discoveryStartTimeoutId) {
      clearTimeout(this.discoveryStartTimeoutId);
      this.discoveryStartTimeoutId = 0;
    }

    if (this.discoveryStopTimeoutId) {
      clearTimeout(this.discoveryStopTimeoutId);
      this.discoveryStopTimeoutId = 0;
    }

    BluetoothModel.unsubscribeBluetoothDeviceFind();
    BluetoothModel.unsubscribeBondStateChange();
    BluetoothModel.unsubscribeDeviceStateChange();
    BluetoothModel.unsubscribePinRequired();
    AppStorage.Delete('BluetoothFailedDialogFlag');
    return this;
  }

  /**
   * Set toggle value
   */
  toggleValue(isOn: boolean) {
    if(this.discoveryStartTimeoutId) {
      clearTimeout(this.discoveryStartTimeoutId);
      this.discoveryStartTimeoutId = 0;
    }
    if(this.discoveryStopTimeoutId) {
      clearTimeout(this.discoveryStopTimeoutId);
      this.discoveryStopTimeoutId = 0;
    }
    if(this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = 0;
    }
   
    this.debounceTimer = setTimeout(() => {
      let curState = BluetoothModel.getState();
      if ((curState === 2) === isOn) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = 0;
        return;
      }
      this.enabled = false
      AppStorage.SetOrCreate('bluetoothToggleEnabled', this.enabled);
      LogUtil.log(this.TAG + 'afterCurrentValueChanged bluetooth state isOn = ' + this.isOn)
      if (isOn) {
        BluetoothModel.enableBluetooth();
      } else {
        BluetoothModel.disableBluetooth();
        clearTimeout(this.debounceTimer);
        this.debounceTimer = 0;
        // remove all elements from availableDevices array
        this.availableDevices.splice(0, this.availableDevices.length);
      }
    }, DISCOVERY_DEBOUNCE_TIME);
  }

  /**
   * Get Local Name
   */
  getLocalName() {
    AppStorage.SetOrCreate('bluetoothLocalName', AboutDeviceModel.getSystemName());
  }

  /**
   * Pair device.
   *
   * @param deviceId device id
   * @param success success callback
   * @param error error callback
   */
  pair(deviceId: string, success?: (pinCode: string) => void, error?: () => void): void {
    const device: BluetoothDevice = this.getAvailableDevice(deviceId);
    if (device && device.connectionState === BondState.BOND_STATE_BONDING) {
      LogUtil.log(this.TAG + `bluetooth no Aavailable device or device is already pairing.`)
      return;
    }
    // start pairing
     BluetoothModel.pairDevice(deviceId);
  }

  /**
   * Confirm pairing.
   *
   * @param deviceId device id
   * @param accept accept or not
   * @param success success callback
   * @param error error callback
   */
  confirmPairing(deviceId: string, accept: boolean): void {
    if (accept) {
      try {
        this.getAvailableDevice(deviceId).connectionState = BondState.BOND_STATE_BONDING;
      } catch (err) {
        LogUtil.error(this.TAG + 'confirmPairing =' + JSON.stringify(err));
      }
    }
    // set paring confirmation
    BluetoothModel.setDevicePairingConfirmation(deviceId, accept);

  }

  /**
   * Connect device.
   * @param deviceId device id
   */
  connect(deviceId: string): Array<{
    profileId: number;
    connectRet: boolean;
  }> {
    return BluetoothModel.connectDevice(deviceId);
  }

  /**
   * disconnect device.
   * @param deviceId device id
   */
  disconnect(deviceId: string): Array<{
    profileId: number;
    disconnectRet: boolean;
  }> {
    return BluetoothModel.disconnectDevice(deviceId);
  }

  /**
   * get Profile State
   * @param deviceId device id
   * @param profileId profile id
   */
  getProfileState(deviceId: string, profileId: number): {
    isOn: boolean,
    isEnable: boolean,
    description: string | ResourceStr
  } {
    return BluetoothModel.getProfileState(deviceId, profileId);
  }

  /**
   * Connect profile.
   * @param deviceId device id
   * @param profileId profile id
   */
  connectProfile(deviceId: string, profileId: number): void {
    BluetoothModel.connectProfile(deviceId, profileId);
  }
  /**
   * disconnect profile.
   * @param deviceId device id
   * @param profileId profile id
   */
  disconnectProfile(deviceId: string, profileId: number): void {
    BluetoothModel.disconnectProfile(deviceId, profileId);
  }

  /**
   * Unpair device.
   * @param deviceId device id
   */
  unpair(deviceId: string): boolean {
    AppStorage.SetOrCreate('BluetoothFailedDialogFlag', false);
    const result = BluetoothModel.unpairDevice(deviceId);
    LogUtil.log(this.TAG + 'bluetooth paired device unpair. result = ' + result)
    this.refreshPairedDevices()
    return result;
  }

  /**
   * Refresh paired devices.
   */
  refreshPairedDevices() {
    let deviceIds: string[] = BluetoothModel.getPairedDeviceIds();
    let list: BluetoothDevice[] = []
    deviceIds.forEach(deviceId => {
      list.push(this.getDevice(deviceId));
    });
    this.pairedDevices = list;
    this.sortPairedDevices();
    AppStorage.SetOrCreate('bluetoothPairedDevices', this.pairedDevices);
    LogUtil.log(this.TAG + 'bluetooth paired devices. list length = ' + JSON.stringify(list.length))
  }

  /**
   * Paired device should be shown on top of the list.
   */
  private sortPairedDevices() {
    LogUtil.log(this.TAG + 'sortPairedDevices in.')
    this.pairedDevices.sort((a: BluetoothDevice, b: BluetoothDevice) => {
      if (a.connectionState == ProfileConnectionState.STATE_DISCONNECTED && b.connectionState == ProfileConnectionState.STATE_DISCONNECTED) {
        return 0
      } else if (b.connectionState == ProfileConnectionState.STATE_DISCONNECTED) {
        return -1
      } else if (a.connectionState == ProfileConnectionState.STATE_DISCONNECTED) {
        return 1
      } else {
        return 0
      }
    })
    LogUtil.log(this.TAG + 'sortPairedDevices out.')
  }

  //---------------------- subscribe ----------------------
  /**
   * Subscribe bluetooth state change
   */
  private subscribeStateChange() {
    BluetoothModel.subscribeStateChange((isOn: boolean) => {
      LogUtil.log(this.TAG + 'bluetooth state changed. isOn = ' + isOn)
      this.isOn = new Boolean(isOn).valueOf();
      this.enabled = true;

      LogUtil.log(this.TAG + 'bluetooth state changed. save value.')
      this.getLocalName()
      AppStorage.SetOrCreate('bluetoothIsOn', this.isOn);
      AppStorage.SetOrCreate('bluetoothToggleEnabled', this.enabled);

      if (isOn) {
        LogUtil.log(this.TAG + 'bluetooth state changed. unsubscribe')
        this.startBluetoothDiscovery();
      } else {
        LogUtil.log(this.TAG + 'bluetooth state changed. subscribe')
        this.mStopBluetoothDiscovery();
      }
    });
  }

  /**
   * Subscribe device find
   */
  private subscribeBluetoothDeviceFind() {
    BluetoothModel.subscribeBluetoothDeviceFind((deviceIds: Array<string>) => {
      LogUtil.log(ConfigData.TAG + 'available bluetooth devices changed.');

      deviceIds?.forEach(deviceId => {
        let device = this.availableDevices.find((availableDevice) => {
          return availableDevice.deviceId === deviceId
        })
        LogUtil.log(this.TAG + 'available bluetooth find');
        if (!device) {
          let pairedDevice = this.pairedDevices.find((pairedDevice) => {
            return pairedDevice.deviceId === deviceId
          })
          if (pairedDevice) {
            LogUtil.log(this.TAG + `available bluetooth is paried.`);
            let indexDeviceID = 0;
            for (let i = 0; i < this.pairedDevices.length; i++) {
              if (this.pairedDevices[i].deviceId === deviceId) {
                indexDeviceID = i;
                break;
              }
            }
            let existDevice = this.getDevice(deviceId);
            if(existDevice.deviceName !== this.pairedDevices[indexDeviceID].deviceName){
              this.pairedDevices.splice(indexDeviceID,1,existDevice);
              AppStorage.setOrCreate('bluetoothPairedDevices', this.pairedDevices);
            }
          } else {
            LogUtil.log(this.TAG + 'available bluetooth new device found. availableDevices length = ' + this.availableDevices.length);
            let newDevice = this.getDevice(deviceId);
            if (!!newDevice.deviceName) {
              this.availableDevices.push(newDevice);
            }

            LogUtil.log(this.TAG + 'available bluetooth new device pushed. availableDevices length = ' + this.availableDevices.length);
          }
        } else {
          LogUtil.log(this.TAG + 'bluetooth already exist!');
          let indexDeviceID = 0;
          for (let i = 0; i < this.availableDevices.length; i++) {
            if (this.availableDevices[i].deviceId === deviceId) {
              indexDeviceID = i;
              break;
            }
          }
          let existDevice = this.getDevice(deviceId);
          if(existDevice.deviceName !== this.availableDevices[indexDeviceID].deviceName){
            this.availableDevices.splice(indexDeviceID,1,existDevice);
          }
        }
      })
      AppStorage.SetOrCreate('bluetoothAvailableDevices', this.availableDevices);
    });
  }

  /**
   * Subscribe bond state change
   */
  private subscribeBondStateChange() {
    BluetoothModel.subscribeBondStateChange((data: {
      deviceId: string;
      bondState: number;
    }) => {
      LogUtil.info(this.TAG + "data.bondState" + JSON.stringify(data.bondState))
      //paired devices
      if (data.bondState !== BondState.BOND_STATE_BONDING) {
        AppStorage.SetOrCreate("controlPairing", true)
        this.refreshPairedDevices();
      }

      //available devices
      if (data.bondState == BondState.BOND_STATE_BONDING) {
        AppStorage.SetOrCreate("controlPairing", false)
        // case bonding
        // do nothing and still listening
        LogUtil.log(this.TAG + 'bluetooth continue listening bondStateChange.');
        if (this.getAvailableDevice(data.deviceId) != null) {
          this.getAvailableDevice(data.deviceId).connectionState = ProfileConnectionState.STATE_CONNECTING;
        }

      } else if (data.bondState == BondState.BOND_STATE_INVALID) {
        AppStorage.SetOrCreate("controlPairing", true)
        // case failed
        if (this.getAvailableDevice(data.deviceId) != null) {
          this.getAvailableDevice(data.deviceId).connectionState = ProfileConnectionState.STATE_DISCONNECTED;
        }
        this.forceRefresh(this.availableDevices);
        AppStorage.SetOrCreate('bluetoothAvailableDevices', this.availableDevices);
        let showFlag = AppStorage.Get('BluetoothFailedDialogFlag');
        if (showFlag == false) {
          AppStorage.SetOrCreate('BluetoothFailedDialogFlag', true);
          return;
        }
        this.showConnectFailedDialog(this.getDevice(data.deviceId).deviceName);
      } else if (data.bondState == BondState.BOND_STATE_BONDED) {
        // case success
        LogUtil.log(this.TAG + 'bluetooth bonded : remove device.');
        this.removeAvailableDevice(data.deviceId);
        BluetoothModel.connectDevice(data.deviceId);
      }

    });
  }

  /**
   * Subscribe device connect state change
   */
  private subscribeDeviceConnectStateChange() {
    BluetoothModel.subscribeDeviceStateChange((data: {
      profileId: number;
      deviceId: string;
      profileConnectionState: number;
    }) => {
      LogUtil.log(this.TAG + 'device connection state changed. profileId:' + JSON.stringify(data.profileId)
      + ' profileConnectionState: ' + JSON.stringify(data.profileConnectionState));
      for (let device of this.pairedDevices) {
        if (device.deviceId === data.deviceId) {
          device.setProfile(data);
          this.sortPairedDevices();
          AppStorage.SetOrCreate('bluetoothPairedDevices', this.pairedDevices);
          if (data.profileId === constant.ProfileId.PROFILE_A2DP_SOURCE) {
            let innerEvent: emitter.InnerEvent = {
              eventId: constant.ProfileId.PROFILE_A2DP_SOURCE
            };
            LogUtil.info('constant.ProfileId.PROFILE_A2DP_SOURCE,data.profileConnectionState,eventData')
            this.setProfileEventData(data.profileConnectionState);
            emitter.emit(innerEvent, this.eventData)
          }
          else if (data.profileId === constant.ProfileId.PROFILE_HANDSFREE_AUDIO_GATEWAY) {
            let innerEvent: emitter.InnerEvent = {
              eventId: constant.ProfileId.PROFILE_HANDSFREE_AUDIO_GATEWAY
            };
            this.setProfileEventData(data.profileConnectionState);
            LogUtil.info('constant.ProfileId.PROFILE_A2DP_SOURCE,data.profileConnectionState,eventData')
            emitter.emit(innerEvent, this.eventData)
          }
          else if (data.profileId === constant.ProfileId.PROFILE_HID_HOST) {
            let innerEvent: emitter.InnerEvent = {
              eventId: constant.ProfileId.PROFILE_HID_HOST
            };
            this.setProfileEventData(data.profileConnectionState);
            emitter.emit(innerEvent, this.eventData)
          } else {
            // Do nothing
          }
          break;
        }
      };
      LogUtil.log(this.TAG + 'device connection state changed. pairedDevices length = '
      + JSON.stringify(this.pairedDevices.length))
      LogUtil.log(this.TAG + 'device connection state changed. availableDevices length = '
      + JSON.stringify(this.availableDevices.length))
      this.removeAvailableDevice(data.deviceId);
    });
  }

  //---------------------- private ----------------------
  /**
   * Get device by device id.
   * @param deviceId device id
   */
  protected getDevice(deviceId: string): BluetoothDevice {
    let device = new BluetoothDevice();
    device.deviceId = deviceId;
    device.deviceName = BluetoothModel.getDeviceName(deviceId);
    device.deviceType = BluetoothModel.getDeviceType(deviceId);
    device.setProfiles(BluetoothModel.getDeviceState(deviceId));
    return device;
  }

  /**
   * Force refresh array.
   * Note: the purpose of this function is just trying to fix page (ets) level's bug below,
   *   and should be useless if fixed by the future sdk.
   * Bug Details:
   *   @State is not supported well for Array<CustomClass> type.
   *   In the case that the array item's field value changed, while not its length,
   *   the build method on page will not be triggered!
   */
  protected forceRefresh(arr: BluetoothDevice[]): void {
    arr.push(new BluetoothDevice())
    arr.pop();
  }

  /**
   * Start bluetooth discovery.
   */
  @Log
  public startBluetoothDiscovery() {
    this.isDeviceDiscovering = true;
    BluetoothModel.startBluetoothDiscovery();
    if(this.discoveryStopTimeoutId) {
      clearTimeout(this.discoveryStopTimeoutId);
      this.discoveryStopTimeoutId = 0;
    }
    this.discoveryStopTimeoutId = setTimeout(() => {
      this.stopBluetoothDiscovery();
      clearTimeout(this.discoveryStopTimeoutId);
      this.discoveryStopTimeoutId = 0;
    }, DISCOVERY_DURING_TIME);
  }

  /**
   * Stop bluetooth discovery.
   */
  @Log
  private stopBluetoothDiscovery() {
    this.isDeviceDiscovering = false;
    BluetoothModel.stopBluetoothDiscovery();
    if(this.discoveryStartTimeoutId) {
      clearTimeout(this.discoveryStartTimeoutId);
      this.discoveryStartTimeoutId = 0;
    }
    this.discoveryStartTimeoutId = setTimeout(() => {
      this.startBluetoothDiscovery();
      clearTimeout(this.discoveryStartTimeoutId);
      this.discoveryStartTimeoutId = 0;
    }, DISCOVERY_INTERVAL_TIME);
  }

  /**
   * Stop bluetooth discovery.
   */
  private mStopBluetoothDiscovery() {
    this.isDeviceDiscovering = false;
    BluetoothModel.stopBluetoothDiscovery();
    if (this.discoveryStartTimeoutId) {
      clearTimeout(this.discoveryStartTimeoutId);
      this.discoveryStartTimeoutId = 0;
    }

    if (this.discoveryStopTimeoutId) {
      clearTimeout(this.discoveryStopTimeoutId);
      this.discoveryStopTimeoutId = 0;
    }
  }


  /**
   * Get available device.
   *
   * @param deviceId device id
   */
  private getAvailableDevice(deviceIds: string): BluetoothDevice {
    LogUtil.log(this.TAG + 'getAvailableDevice  length = ' + this.availableDevices.length);
    let temp = this.availableDevices;
    for (let i = 0; i < temp.length; i++) {
      if (temp[i].deviceId === deviceIds) {
        return temp[i];
      }
    }
    return null;
  }

  /**
   * Remove available device.
   *
   * @param deviceId device id
   */
  private removeAvailableDevice(deviceId: string): void {
    LogUtil.log(this.TAG + 'removeAvailableDevice : before : availableDevices length = ' + this.availableDevices.length);
    this.availableDevices = this.availableDevices.filter((device) => device.deviceId !== deviceId)
    AppStorage.SetOrCreate('bluetoothAvailableDevices', this.availableDevices);
    LogUtil.log(this.TAG + 'removeAvailableDevice : after : availableDevices length = ' + this.availableDevices.length);
  }

  /**
   * Connect Failed Dialog
   */
  private showConnectFailedDialog(deviceName: string) {
    AlertDialog.show({
      title: $r("app.string.bluetooth_connect_failed"),
      message: $r("app.string.bluetooth_connect_failed_msg", deviceName),
      confirm: {
        value: $r("app.string.bluetooth_know_button"),
        action: () => {
          LogUtil.info('Button-clicking callback')
        }
      },
      cancel: () => {
        LogUtil.info('Closed callbacks')
      },
      alignment: deviceTypeInfo === 'phone' || deviceTypeInfo === 'default' ? DialogAlignment.Bottom : DialogAlignment.Center,
      offset: ({
        dx: 0, dy: deviceTypeInfo === 'phone' || deviceTypeInfo === 'default' ? '-24dp' : 0
      })
    })

  }

  private setProfileEventData(state: number) {
    switch (state) {
      case ProfileConnectionState.STATE_DISCONNECTED:
        this.eventData = {
          data: {
            'State': false,
            'Enable': true,
            'Description': ''
          }
        }
        break;
      case ProfileConnectionState.STATE_CONNECTING:
        this.eventData = {
          data: {
            'State': true,
            'Enable': false,
            'Description': $r('app.string.bt_state_connecting')
          }
        }
        break;
      case ProfileConnectionState.STATE_CONNECTED:
        this.eventData = {
          data: {
            'State': true,
            'Enable': true,
            'Description': $r('app.string.bt_state_connected')
          }
        }
        break;
      case ProfileConnectionState.STATE_DISCONNECTING:
        this.eventData = {
          data: {
            'State': false,
            'Enable': false,
            'Description': $r('app.string.bt_state_connected')
          }
        }
        break;
      default:
        LogUtil.info('eventData has no value')
    }
  }
}