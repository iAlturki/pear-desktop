#pragma once

#include <unknwn.h>
#include <functional>
#include <WebView2.h>

class CoreEnvCompletedHandler : public ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(HRESULT, ICoreWebView2Environment*)> m_func;
public:
    CoreEnvCompletedHandler(std::function<HRESULT(HRESULT, ICoreWebView2Environment*)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Environment* env) override {
        return m_func ? m_func(result, env) : S_OK;
    }
};

class CoreControllerCompletedHandler : public ICoreWebView2CreateCoreWebView2ControllerCompletedHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(HRESULT, ICoreWebView2Controller*)> m_func;
public:
    CoreControllerCompletedHandler(std::function<HRESULT(HRESULT, ICoreWebView2Controller*)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Controller* controller) override {
        return m_func ? m_func(result, controller) : S_OK;
    }
};

class CoreWebMessageReceivedHandler : public ICoreWebView2WebMessageReceivedEventHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs*)> m_func;
public:
    CoreWebMessageReceivedHandler(std::function<HRESULT(ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs*)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2WebMessageReceivedEventHandler) {
            *ppv = static_cast<ICoreWebView2WebMessageReceivedEventHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args) override {
        return m_func ? m_func(sender, args) : S_OK;
    }
};

class CoreExecuteScriptCompletedHandler : public ICoreWebView2ExecuteScriptCompletedHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(HRESULT, LPCWSTR)> m_func;
public:
    CoreExecuteScriptCompletedHandler(std::function<HRESULT(HRESULT, LPCWSTR)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2ExecuteScriptCompletedHandler) {
            *ppv = static_cast<ICoreWebView2ExecuteScriptCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT errorCode, LPCWSTR resultObjectAsJson) override {
        return m_func ? m_func(errorCode, resultObjectAsJson) : S_OK;
    }
};

class CoreAddScriptCompletedHandler : public ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(HRESULT, LPCWSTR)> m_func;
public:
    CoreAddScriptCompletedHandler(std::function<HRESULT(HRESULT, LPCWSTR)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler) {
            *ppv = static_cast<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT errorCode, LPCWSTR id) override {
        return m_func ? m_func(errorCode, id) : S_OK;
    }
};

class CoreWebResourceRequestedHandler : public ICoreWebView2WebResourceRequestedEventHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs*)> m_func;
public:
    CoreWebResourceRequestedHandler(std::function<HRESULT(ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs*)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2WebResourceRequestedEventHandler) {
            *ppv = static_cast<ICoreWebView2WebResourceRequestedEventHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* sender, ICoreWebView2WebResourceRequestedEventArgs* args) override {
        return m_func ? m_func(sender, args) : S_OK;
    }
};

class CoreNavigationCompletedHandler : public ICoreWebView2NavigationCompletedEventHandler {
    LONG m_refCount = 1;
    std::function<HRESULT(ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs*)> m_func;
public:
    CoreNavigationCompletedHandler(std::function<HRESULT(ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs*)> func)
        : m_func(std::move(func)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2NavigationCompletedEventHandler) {
            *ppv = static_cast<ICoreWebView2NavigationCompletedEventHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_refCount); }
    ULONG STDMETHODCALLTYPE Release() override {
        LONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) delete this;
        return count;
    }
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* sender, ICoreWebView2NavigationCompletedEventArgs* args) override {
        return m_func ? m_func(sender, args) : S_OK;
    }
};

