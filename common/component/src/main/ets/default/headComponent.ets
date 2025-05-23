/**
 * Copyright (c) 2021 Huawei Device Co., Ltd.
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
import Router from '@system.router';
import ComponentConfig from './ComponentConfig';

/**
 * head custom component
 */
@Component
export default struct HeadComponent {
  @State isTouch: boolean = false;
  private isActive: boolean = true;
  private icBackIsVisibility: boolean = true;
  private headName: string | Resource = '';

  build() {
    Row() {
      Stack({ alignContent: Alignment.Center }) {
        Image($r('app.media.ic_back'))
          .width($r('app.float.wh_value_24'))
          .height($r('app.float.wh_value_24'))
          .fillColor($r("sys.color.ohos_id_color_primary"))
      }
      .margin({ right: $r('app.float.wh_value_16') })
      .backgroundColor(this.isTouch ? $r('app.color.color_E3E3E3_grey') : $r('app.color.color_00000000_transparent'))
      .visibility(this.icBackIsVisibility ? Visibility.Visible : Visibility.None)
      .onClick(() => {
        Router.back();
      })
      .onTouch((event?: TouchEvent | undefined) => {
        if (event?.type === TouchType.Down) {
          this.isTouch = true;
        }
        if (event?.type === TouchType.Up) {
          this.isTouch = false;
        }
      });

      Text(this.headName)
        .fontSize($r('app.float.head_font_24'))
        .lineHeight($r('app.float.wh_value_33'))
        .fontFamily('HarmonyHeiTi-Bold')
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.font_color_182431'))
        .maxLines(ComponentConfig.MAX_LINES_1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.Start)
        .margin({ top: $r('app.float.wh_value_13'), bottom: $r('app.float.wh_value_15') });
    }
    .width(ComponentConfig.WH_100_100)
    .padding({ left: $r('app.float.wh_value_12') })
    .height($r('app.float.wh_value_56'))
    .alignItems(VerticalAlign.Center)
    .align(Alignment.Start)
  }
}