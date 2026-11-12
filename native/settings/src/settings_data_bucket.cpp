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

#include "include/settings_data_bucket.h"

#include <chrono>

#include "datashare_values_bucket.h"
#include "values_bucket.h"

namespace OHOS {
namespace Settings {

const std::string SETTINGS_DATA_FIELD_KEYWORD = "KEYWORD";
const std::string SETTINGS_DATA_FIELD_VALUE = "VALUE";
const std::string SETTINGS_DATA_FIELD_LAST_MODIFY_SOURCE = "LAST_MODIFY_SOURCE";
const std::string SETTINGS_DATA_FIELD_LAST_MODIFY_TIME = "LAST_MODIFY_TIME";

std::string GetCurrentTimestampStr()
{
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    return std::to_string(ms);
}

OHOS::DataShare::DataShareValuesBucket BuildDataShareBucket(
    const std::string& key, const std::string& value,
    const std::string& callerBundle, const std::string& timestampStr, bool withDfx)
{
    OHOS::DataShare::DataShareValuesBucket bucket;
    bucket.Put(SETTINGS_DATA_FIELD_KEYWORD, key);
    bucket.Put(SETTINGS_DATA_FIELD_VALUE, value);
    if (withDfx) {
        if (!callerBundle.empty()) {
            bucket.Put(SETTINGS_DATA_FIELD_LAST_MODIFY_SOURCE, callerBundle);
        }
        bucket.Put(SETTINGS_DATA_FIELD_LAST_MODIFY_TIME, timestampStr);
    }
    return bucket;
}

OHOS::NativeRdb::ValuesBucket BuildRdbBucket(
    const std::string& key, const std::string& value,
    const std::string& callerBundle, const std::string& timestampStr, bool withDfx)
{
    OHOS::NativeRdb::ValuesBucket bucket;
    bucket.PutString(SETTINGS_DATA_FIELD_KEYWORD, key);
    bucket.PutString(SETTINGS_DATA_FIELD_VALUE, value);
    if (withDfx) {
        if (!callerBundle.empty()) {
            bucket.PutString(SETTINGS_DATA_FIELD_LAST_MODIFY_SOURCE, callerBundle);
        }
        bucket.PutString(SETTINGS_DATA_FIELD_LAST_MODIFY_TIME, timestampStr);
    }
    return bucket;
}

} // namespace Settings
} // namespace OHOS
