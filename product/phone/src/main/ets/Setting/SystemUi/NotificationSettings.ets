/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2024-2025. All rights reserved.
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

/* instrument ignore file */
import common from '@ohos.app.ability.common';
import bundleManager from '@ohos.bundle.bundleManager';
import { PushParam, Params } from '@ohos/settings.common/src/main/ets/core/controller/Controller';
import { HiSysEventUtil } from '@ohos/settings.common/src/main/ets/systemEvent/HiSysEventUtil';
import { PageParams } from '@ohos/settings.common/src/main/ets/framework/common/PageLoader';
import { ObservedData, UiExtensionViewModel } from '@ohos/settings.common/src/main/ets/viewmodel/UiExtensionViewModel';
import { ExitAbnormallyComponent } from '@ohos/settings.common/src/main/ets/viewmodel/ExitAbnormallyComponent';
import { LogUtil } from '@ohos/settings.common/src/main/ets/utils/LogUtil';
import { PageStartModeManager } from '@ohos/settings.common/src/main/ets/window/PageStartModeManager';
import { HiSysSettingHomeEventGroup } from '@ohos/settings.common/src/main/ets/systemEvent/BehaviorEventConsts';
import { PageRouter } from '@ohos/settings.common/src/main/ets/framework/common/PageRouter';
import { CheckEmptyUtils } from '@ohos/settings.common/src/main/ets/utils/CheckEmptyUtils';
import { AppListLoader } from '@ohos/settings.application/src/main/ets/AppListLoader';
import { ContainerAppPushConfig } from '@ohos/settings.application/src/main/ets/model/ContainerAppPushConfig';
import { UIExtensionSessionUtils } from '@ohos/settings.common/src/main/ets/utils/UIExtensionSessionUtils';
import { NavEntryKey } from '@ohos/settings.common/src/main/ets/utils/Consts';

const TAG: string = 'NotificationSettings : ';
const BUNDLE_NAME: string = 'com.ohos.sceneboard';
const ABILITY_NAME: string = 'NotificationUIExtAbility';

@Builder
export function NotificationSettingsLoader($$: Params): void {
  if (LogUtil.printBuilderLog(`${TAG} notification settings loader`)) {
    NotificationSettings({ params: $$ as Object as PushParam });
  }
}

@Component
export struct NotificationSettings {
  uiExtensionProxy?: UIExtensionProxy;
  @Consume('pathInfos') pathInfos: NavPathStack;
  @State params: PushParam | null = null;
  @State observedData: ObservedData = new ObservedData();
  private viewModel: UiExtensionViewModel = new UiExtensionViewModel(this.observedData);
  @StorageProp('navigationMode')
  @Watch('onNavigationModeChange') navigationMode: NavigationMode = NavigationMode.Stack;
  @State firstNavigationMode: NavigationMode = NavigationMode.Stack;
  private context = getContext(this) as common.UIAbilityContext;
  isFromExternal: boolean = false;
  private startTime: number = 0;
  recoverController: CustomDialogController = new CustomDialogController({
    builder: ExitAbnormallyComponent(),
  });

  build() {
    NavDestination() {
      UIExtensionComponent(this.getWant(), { dpiFollowStrategy: DpiFollowStrategy.FOLLOW_HOST_DPI })
        .defaultFocus(true)
        .onRemoteReady((proxy) => {
          LogUtil.info(`${TAG} onRemoteReady navigationMode: ${this.navigationMode}, hideBackButton: ${this.shouldHideBackButton()}`);
          this.uiExtensionProxy = proxy;
          this.sendNavigationState();
          this.uiExtensionProxy?.on('syncReceiverRegister', () => {
            this.sendNavigationState();
          });
          UIExtensionSessionUtils.sendTitleAnimationDuration(this.uiExtensionProxy, this.startTime);
          this.uiExtensionProxy?.on('asyncReceiverRegister', () => {
            UIExtensionSessionUtils.sendTitleAnimationDuration(this.uiExtensionProxy, this.startTime);
          });
        })
        .accessibilityUseSamePage(AccessibilitySamePageMode.SEMI_SILENT)
        .onError((error) => {
          LogUtil.info(`${TAG} UIExtensionComponent onError code: ${error?.code} message: ${error?.message}`);
          this.viewModel.refreshing(error, this.recoverController, BUNDLE_NAME, ABILITY_NAME);
        })
        .onTerminated(() => {
        })
        .onReceive(this.onDataReceive)
        .size({ width: '100%', height: '100%' })
        //.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM, SafeAreaEdge.TOP])
    }
    .hideTitleBar(true)
    .backgroundColor($r('sys.color.ohos_id_color_sub_background'))
    .onShown(() => {
      LogUtil.info(`${TAG} NavDestination onShown ${JSON.stringify(this.getWant())}`);
      // 分栏进出详情栈后刷新返回键显隐
      this.sendNavigationState();
      // delay start page transition animation
      if (this.navigationMode === NavigationMode.Stack) {
        this.viewModel.delayTransition();
      }
    })
    .onHidden(() => {
      LogUtil.info(`${TAG} NavDestination onHidden`);
    })
    .onBackPressed(() => {
      if (this.isFromExternal) {
        LogUtil.info(`${TAG} onBackPressed`);
        this.termiteAbility();
      }
      return this.isFromExternal;
    })
  }

  private getWant(): Want {
    const hideBackButton: boolean = this.shouldHideBackButton();
    const extensionNavMode: NavigationMode = this.getExtensionNavigationMode();
    if (AppListLoader.getInstance()
      .getAppType(AppListLoader.getInstance().getAppEntry(this.params?.bundleName ?? '') ?? null) === 'meetaApp') {
      const param : PushParam = new PushParam({
        bundleName: this.params?.bundleName,
        isFromNc: false,
        appIndex:0,
        isMetaService: true
      } as ContainerAppPushConfig);
      return {
        bundleName: BUNDLE_NAME,
        abilityName: ABILITY_NAME,
        parameters: {
          'ability.want.params.uiExtensionType': 'sys/commonUI',
          'navigationMode': extensionNavMode,
          'hideBackButton': hideBackButton,
          'pushParams': param,
          'startReason': this.params?.startReason ?? PageStartModeManager.getInstance().getStartReason(),
          'reconnect': this.observedData.reconnect,
        },
      } as Want;
    }
    return {
      bundleName: BUNDLE_NAME,
      abilityName: ABILITY_NAME,
      parameters: {
        'ability.want.params.uiExtensionType': 'sys/commonUI',
        'navigationMode': extensionNavMode,
        'hideBackButton': hideBackButton,
        'pushParams': (this.params?.config || this.params?.subUri || this.params?.bundleName) as string,
        'startReason': this.params?.startReason ?? PageStartModeManager.getInstance().getStartReason(),
        'reconnect': this.observedData.reconnect,
      }
    } as Want;
  }

  /**
   * SceneBoard NotificationMgmt 的 IsHideBackButton 只认 navigationMode===Split，
   * 不消费 hideBackButton。详情页需上报 Stack，扩展侧才会画返回键。
   */
  private getExtensionNavigationMode(): NavigationMode {
    if (this.isAppNotificationDetail()) {
      return NavigationMode.Stack;
    }
    return this.navigationMode;
  }

  /**
   * Pad 分栏一级页隐藏返回；通知管理详情（或栈深>1）必须显示返回键。
   */
  private shouldHideBackButton(): boolean {
    if (this.navigationMode !== NavigationMode.Split) {
      return false;
    }
    if (this.isAppNotificationDetail()) {
      return false;
    }
    return (this.pathInfos?.size() ?? 0) <= 1;
  }

  private isAppNotificationDetail(): boolean {
    const pathNames: string[] = this.pathInfos?.getAllPathName() ?? [];
    if (pathNames.length > 0 &&
      pathNames[pathNames.length - 1] === NavEntryKey.NOTIFICATION_SETTINGS_DETAIL_ENTRY) {
      return true;
    }
    if (this.params?.bundleName) {
      return true;
    }
    const config: Object | string | undefined = this.params?.config as Object | string | undefined;
    if (config !== undefined && typeof config === 'object' &&
      (config as Record<string, Object>)['bundleName'] !== undefined) {
      return true;
    }
    return false;
  }

  private sendNavigationState(): void {
    const hideBackButton: boolean = this.shouldHideBackButton();
    const extensionNavMode: NavigationMode = this.getExtensionNavigationMode();
    LogUtil.info(`${TAG} sendNavigationState hostMode: ${this.navigationMode}, ` +
      `extensionMode: ${extensionNavMode}, hideBackButton: ${hideBackButton}`);
    this.uiExtensionProxy?.send({
      'navigationMode': extensionNavMode,
      'hideBackButton': hideBackButton,
    });
  }

  onNavigationModeChange(): void {
    LogUtil.info(`${TAG} onNavigationModeChange navigationMode: ${this.navigationMode}`);
    this.sendNavigationState();
  }

  async aboutToAppear(): Promise<void> {
    LogUtil.info(`${TAG} aboutToAppear`);
    this.startTime = new Date().getTime();
    let appIndex: number = await this.getAppIndexInCaller();
    let param = (this.params as PageParams)?.param;
    if (!(this.params)?.config && param) {
      this.params = param;
    }
    if (this.params && this.params.config) {
      this.params.appIndex = appIndex;
      let config: object = this.params.config;
      let configConfig: object | undefined = config['config'];
      if (!configConfig) {
        let pushParam = new PushParam();
        pushParam.bundleName = config['bundleName'];
        pushParam.appIndex = appIndex;
        configConfig = pushParam;
        config['config'] = configConfig;
        this.params.config = config;
      }
    }
    // params 归一化后再决定上报给扩展的 navigationMode
    this.firstNavigationMode = this.getExtensionNavigationMode();
    LogUtil.info(`${TAG} aboutToAppear hostMode: ${this.navigationMode}, ` +
      `extensionMode: ${this.firstNavigationMode}, isDetail: ${this.isAppNotificationDetail()}`);
    this.viewModel.listening(this.recoverController);
    HiSysEventUtil.reportDefaultBehaviorEventByUE(HiSysSettingHomeEventGroup.ENTER_SYSTEM_NOTIFICATION);
  }

  private async getAppIndexInCaller(): Promise<number> {
    let appIndexInWant: Object | undefined = AppStorage.get<Want>('wantParams')?.parameters?.appIndex;
    if (!CheckEmptyUtils.isEmpty(appIndexInWant) && typeof appIndexInWant === 'number') {
      LogUtil.info(`${TAG} appIndexInWant ${appIndexInWant}`);
      return Number.isNaN(appIndexInWant as number) ? 0 : (appIndexInWant as number);
    }
    let params = AppStorage.get<Want>('wantParams')?.parameters as Record<string, string>;
    let caller: string = '';
    Object.entries(params)?.forEach(
      (value: [key: string, value: string], index: number) => {
        if (value[0] === 'ohos.aafwk.param.callerUid') {
          caller = value[1];
        }
      }
    );
    LogUtil.info(`${TAG} getAppIndexInCaller, callerUid: ${Number(caller)}`);

    let appIndex: number = 0;
    try {
      const appCloneIdentity = await bundleManager.getAppCloneIdentity(Number(caller));
      appIndex = appCloneIdentity?.appIndex;
    } catch (error) {
      LogUtil.error(`${TAG} getAppCloneIdentity failed, message: ${error?.message}, code: ${error?.code}`);
    }
    LogUtil.info(`${TAG} getAppIndexInCaller, appIndex: ${appIndex}`);
    return appIndex;
  }

  aboutToDisappear(): void {
    LogUtil.info(`${TAG} aboutToDisappear`);
    // 外部页面拉起一步返回
    if (this.isFromExternal) {
      LogUtil.info(`${TAG} from external, teminate ability`);
      this.termiteAbility();
    }
    this.viewModel.destroyListening();
  }

  private termiteAbility(): void {
    this.context.terminateSelf();
  }

  private onDataReceive = (data: object): void => {
    LogUtil.info(`${TAG} UIExtensionComponent onReceive`);
    if (!data) {
      LogUtil.info(`${TAG} data is invalid`);
      return;
    }

    if (data['action'] === 'pop') {
      this.pathInfos.pop();
      LogUtil.info(`${TAG} pop`);
      return;
    }

    //添加跳转方法，能够加入使用设置整体的路由
    if (data['action'] === 'jump' && data['uri']) {
      LogUtil.info(`${TAG} jump uri:${data['uri']}`);
      PageRouter.push(data['uri'], this.getJumpPushParam(data), Boolean(data['isHome']), data['isEntry'],
        Boolean(data['isBack']));
      return;
    }
  }

  //获取跳转参数
  private getJumpPushParam(data: object): PushParam {
    let pushParam = new PushParam();

    pushParam.config = data['config'];
    pushParam.subUri = data['subUri'] as string;
    pushParam.bundleName = data['bundleName'] as string;
    pushParam.startReason = data['startReason'] as string
    pushParam.appIndex = data['appIndex'] as number;
    pushParam.itemName = data['itemName'] as string;

    return pushParam;
  }
}