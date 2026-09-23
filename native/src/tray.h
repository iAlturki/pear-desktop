#pragma once

#include "app.h"
#include <shellapi.h>

class SystemTray {
public:
    static SystemTray& Instance();

    bool Initialize(HWND hWndOwner);
    void Remove();
    void UpdateTooltip(const std::wstring& text);
    void HandleTrayMessage(WPARAM wParam, LPARAM lParam);

private:
    SystemTray();
    ~SystemTray();

    void ShowMenu();

    HWND m_hWndOwner = nullptr;
    NOTIFYICONDATAW m_nid = {};
    bool m_isAdded = false;
};
