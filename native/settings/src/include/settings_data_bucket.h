/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
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

#ifndef SETTINGS_DATA_BUCKET_H
#define SETTINGS_DATA_BUCKET_H

#include <string>

namespace OHOS {
namespace DataShare {
class DataShareValuesBucket;
} // namespace DataShare
namespace NativeRdb {
class ValuesBucket;
} // namespace NativeRdb

namespace Settings {

extern const std::string SETTINGS_DATA_FIELD_KEYWORD;
extern const std::string SETTINGS_DATA_FIELD_VALUE;
extern const std::string SETTINGS_DATA_FIELD_LAST_MODIFY_SOURCE;
extern const std::string SETTINGS_DATA_FIELD_LAST_MODIFY_TIME;

std::string GetCurrentTimestampStr();

OHOS::DataShare::DataShareValuesBucket BuildDataShareBucket(
    const std::string& key, const std::string& value,
    const std::string& callerBundle, const std::string& timestampStr, bool withDfx);

OHOS::NativeRdb::ValuesBucket BuildRdbBucket(
    const std::string& key, const std::string& value,
    const std::string& callerBundle, const std::string& timestampStr, bool withDfx);

} // namespace Settings
} // namespace OHOS

#endif // SETTINGS_DATA_BUCKET_H
