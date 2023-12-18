/*
 * Copyright (c) 2023 Huawei Device Co., Ltd.
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

#include "napi_settings_observer.h"

#include <map>

#include "napi_settings_log.h"
#include "abs_shared_result_set.h"
#include "values_bucket.h"

#include "napi_base_context.h"
#include "os_account_manager.h"


using namespace OHOS::AppExecFwk;
using namespace OHOS::DataShare;
using namespace OHOS::AccountSA;


namespace OHOS {
namespace Settings {

    std::map<std::string, sptr<SettingsObserver>> g_observerMap;
    std::map<std::string, std::shared_ptr<OHOS::DataShare::DataShareHelper>> g_helperMap;

    void SettingsObserver::OnChange()
    {
        OnChangeRet();
    }

    napi_value SettingsObserver::OnChangeRet()
    {
        SETTING_LOG_INFO("%{public}s, O_C.", __func__);
        napi_create_reference(cbInfo->env, cbInfo->callbackArg, 1, &(cbInfo->callbackRef));
        napi_value resource = nullptr;
        NAPI_CALL(cbInfo->env, napi_create_string_utf8(cbInfo->env, __func__, NAPI_AUTO_LENGTH, &resource));
        napi_create_async_work(
            cbInfo->env,
            nullptr,
            resource,
            [](napi_env env, void* data) {},
            [](napi_env env, napi_status status, void* data) {
                if (data == nullptr) {
                    SETTING_LOG_INFO("%{public}s, null.", __func__);
                    return;
                }
                napi_value callback = nullptr;
                napi_value undefined;
                napi_get_undefined(env, &undefined);
                // create error code
                napi_value error = nullptr;
                napi_create_object(env, &error);
                int unSupportCode = 802;
                napi_value errCode = nullptr;
                napi_create_int32(env, unSupportCode, &errCode);
                napi_set_named_property(env, error, "code", errCode);
                napi_value result[PARAM2] = {0};
                result[0] = error;
                result[1] = wrap_bool_to_js(env, false);

                AsyncCallbackInfo* asyncCallbackInfo = (AsyncCallbackInfo*)data;
                napi_get_reference_value(env, asyncCallbackInfo->callbackRef, &callback);
                napi_value callResult;
                napi_call_function(env, undefined, callback, PARAM2, result, &callResult);

                napi_delete_reference(env, asyncCallbackInfo->callbackRef);
                napi_delete_async_work(env, asyncCallbackInfo->asyncWork);
                SETTING_LOG_INFO("%{public}s, O_C complete.", __func__);
            },
            (void*)cbInfo,
            &(cbInfo->asyncWork)
        );
        NAPI_CALL(cbInfo->env, napi_queue_async_work(cbInfo->env, cbInfo->asyncWork));
        return wrap_void_to_js(cbInfo->env);
    }

    std::string GetObserverIdStr()
    {
        std::vector<int> tmpId;
        OHOS::AccountSA::OsAccountManager::QueryActiveOsAccountIds(tmpId);
        std::string tmpIdStr = "100";
        if (tmpId.size() > 0) {
            tmpIdStr = std::to_string(tmpId[0]);
        } else {
            SETTING_LOG_INFO("%{public}s, user id 100.", __func__);
        }
        return tmpIdStr;
    }

    napi_value npai_settings_register_observer(napi_env env, napi_callback_info info)
    {
        SETTING_LOG_INFO("n_s_r_o");
        // Check the number of the arguments
        size_t argc = ARGS_FOUR;
        napi_value args[ARGS_FOUR] = {nullptr};
        NAPI_CALL(env, napi_get_cb_info(env, info, &argc, args, nullptr, nullptr));
        if (argc != ARGS_FOUR) {
            SETTING_LOG_ERROR("%{public}s, wrong number of arguments.", __func__);
            return wrap_bool_to_js(env, false);
        }

        // Check the value type of the arguments
        napi_valuetype valueType;
        NAPI_CALL(env, napi_typeof(env, args[PARAM0], &valueType));
        NAPI_ASSERT(env, valueType == napi_object, "Wrong argument[0] type. Object expected.");
        NAPI_CALL(env, napi_typeof(env, args[PARAM1], &valueType));
        NAPI_ASSERT(env, valueType == napi_string, "Wrong argument[1] type. String expected.");
        NAPI_CALL(env, napi_typeof(env, args[PARAM2], &valueType));
        NAPI_ASSERT(env, valueType == napi_string, "Wrong argument[2] type. String expected.");
        NAPI_CALL(env, napi_typeof(env, args[PARAM3], &valueType));
        NAPI_ASSERT(env, valueType == napi_object, "Wrong argument[3] type. String expected.");

        bool stageMode = false;
        napi_status status = OHOS::AbilityRuntime::IsStageContext(env, args[PARAM0], stageMode);
        if (status != napi_ok) {
            SETTING_LOG_ERROR("%{public}s, not stage mode.", __func__);
            return wrap_bool_to_js(env, false);
        }
        AsyncCallbackInfo *callbackInfo = new AsyncCallbackInfo();
        callbackInfo->env = env;
        callbackInfo->key = unwrap_string_from_js(env, args[PARAM1]);
        callbackInfo->tableName = unwrap_string_from_js(env, args[PARAM2]);
        callbackInfo->callbackArg = args[PARAM3];

        if (g_observerMap.find(callbackInfo->key) != g_observerMap.end() &&
        g_observerMap[callbackInfo->key] != nullptr) {
            SETTING_LOG_INFO("%{public}s, already registered.", __func__);
            return wrap_bool_to_js(env, false);
        }

        std::shared_ptr<OHOS::DataShare::DataShareHelper> dataShareHelper = nullptr;
        dataShareHelper = getDataShareHelper(env, args[PARAM0], stageMode, callbackInfo->tableName);
        if (dataShareHelper == nullptr) {
            return wrap_bool_to_js(env, false);
        }

        std::string strUri = GetStageUriStr(callbackInfo->tableName, GetObserverIdStr(), callbackInfo->key);
        OHOS::Uri uri(strUri);
        sptr<SettingsObserver> settingsObserver = sptr<SettingsObserver>
        (new (std::nothrow)SettingsObserver(callbackInfo));
        g_observerMap[callbackInfo->key] = settingsObserver;
        g_helperMap[callbackInfo->key] = dataShareHelper;
        dataShareHelper->RegisterObserver(uri, settingsObserver);
        dataShareHelper->Release();

        return wrap_bool_to_js(env, true);
    }

    napi_value npai_settings_unregister_observer(napi_env env, napi_callback_info info)
    {
        SETTING_LOG_INFO("n_s_u_o");
        // Check the number of the arguments
        size_t argc = ARGS_THREE;
        napi_value args[ARGS_THREE] = {nullptr};
        NAPI_CALL(env, napi_get_cb_info(env, info, &argc, args, nullptr, nullptr));
        if (argc != ARGS_THREE) {
            SETTING_LOG_ERROR("%{public}s, wrong number of arguments.", __func__);
            return wrap_bool_to_js(env, false);
        }
        // Check the value type of the arguments
        napi_valuetype valueType;
        NAPI_CALL(env, napi_typeof(env, args[PARAM0], &valueType));
        NAPI_ASSERT(env, valueType == napi_object, "Wrong argument[0] type. Object expected.");
        NAPI_CALL(env, napi_typeof(env, args[PARAM1], &valueType));
        NAPI_ASSERT(env, valueType == napi_string, "Wrong argument[1] type. String expected.");
        NAPI_CALL(env, napi_typeof(env, args[PARAM2], &valueType));
        NAPI_ASSERT(env, valueType == napi_string, "Wrong argument[2] type. String expected.");

        bool stageMode = false;
        napi_status status = OHOS::AbilityRuntime::IsStageContext(env, args[PARAM0], stageMode);
        if (status != napi_ok) {
            SETTING_LOG_ERROR("%{public}s, not stage mode.", __func__);
            return wrap_bool_to_js(env, false);
        }

        std::string key = unwrap_string_from_js(env, args[PARAM1]);
        std::string tableName = unwrap_string_from_js(env, args[PARAM2]);
        std::shared_ptr<OHOS::DataShare::DataShareHelper> dataShareHelper = g_helperMap[key];
        if (dataShareHelper == nullptr || g_observerMap.count(key) == 0) {
            SETTING_LOG_ERROR("%{public}s, null.", __func__);
            return wrap_bool_to_js(env, false);
        }
        if (g_observerMap[key] == nullptr) {
            g_observerMap.erase(key);
            return wrap_bool_to_js(env, false);
        }
        std::string strUri = GetStageUriStr(tableName, GetObserverIdStr(), key);
        OHOS::Uri uri(strUri);
        dataShareHelper->UnregisterObserver(uri, g_observerMap[key]);
        dataShareHelper->Release();
        delete g_observerMap[key]->cbInfo;
        g_observerMap[key]->cbInfo = nullptr;
        delete g_observerMap[key];
        g_observerMap[key] = nullptr;
        g_observerMap.erase(key);
        g_helperMap[key] = nullptr;
        g_helperMap.erase(key);

        return wrap_bool_to_js(env, true);
    }
}
}