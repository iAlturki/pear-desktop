#include "tray.h"
#include "../res/resource.h"
#include <shellapi.h>

#define WM_TRAYICON (WM_USER + 101)

SystemTray& SystemTray::Instance() {
    static SystemTray instance;
    return instance;
}

SystemTray::SystemTray() {}

SystemTray::~SystemTray() {
    Remove();
}

bool SystemTray::Initialize(HWND hWndOwner) {
    m_hWndOwner = hWndOwner;

    ZeroMemory(&m_nid, sizeof(NOTIFYICONDATAW));
    m_nid.cbSize = sizeof(NOTIFYICONDATAW);
    m_nid.hWnd = hWndOwner;
    m_nid.uID = 1;
    m_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    m_nid.uCallbackMessage = WM_TRAYICON;
    HINSTANCE hInst = GetModuleHandleW(NULL);
    m_nid.hIcon = (HICON)LoadImageW(hInst, MAKEINTRESOURCEW(IDI_APP_ICON), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);
    if (!m_nid.hIcon) m_nid.hIcon = LoadIconW(hInst, MAKEINTRESOURCEW(IDI_APP_ICON));
    if (!m_nid.hIcon) m_nid.hIcon = LoadIconW(NULL, (LPCWSTR)IDI_APPLICATION);
    wcscpy_s(m_nid.szTip, L"ytr-music (iALTURKi Native)");

    m_isAdded = Shell_NotifyIconW(NIM_ADD, &m_nid);
    return m_isAdded;
}

void SystemTray::Remove() {
    if (m_isAdded) {
        Shell_NotifyIconW(NIM_DELETE, &m_nid);
        m_isAdded = false;
    }
}

void SystemTray::UpdateTooltip(const std::wstring& text) {
    if (!m_isAdded) return;
    wcsncpy_s(m_nid.szTip, text.c_str(), 127);
    Shell_NotifyIconW(NIM_MODIFY, &m_nid);
}

void SystemTray::HandleTrayMessage(WPARAM wParam, LPARAM lParam) {
    if (lParam == WM_LBUTTONUP) {
        if (g_hMainWindow && IsWindowVisible(g_hMainWindow)) {
            App_HideMainWindow();
        } else {
            App_ShowMainWindow();
        }
    } else if (lParam == WM_RBUTTONUP) {
        ShowMenu();
    }
}

void SystemTray::ShowMenu() {
    HMENU hMenu = CreatePopupMenu();
    InsertMenuW(hMenu, 0, MF_BYPOSITION | MF_STRING, 201, g_currentSong.isPaused ? L"Play" : L"Pause");
    InsertMenuW(hMenu, 1, MF_BYPOSITION | MF_STRING, 202, L"Next Track");
    InsertMenuW(hMenu, 2, MF_BYPOSITION | MF_STRING, 203, L"Previous Track");
    InsertMenuW(hMenu, 3, MF_BYPOSITION | MF_SEPARATOR, 0, NULL);
    InsertMenuW(hMenu, 4, MF_BYPOSITION | MF_STRING, 204, L"Desktop Miniplayer (PiP)");
    InsertMenuW(hMenu, 5, MF_BYPOSITION | MF_STRING, 205, (g_hMainWindow && IsWindowVisible(g_hMainWindow)) ? L"Hide Window" : L"Show Window");
    InsertMenuW(hMenu, 6, MF_BYPOSITION | MF_SEPARATOR, 0, NULL);
    InsertMenuW(hMenu, 7, MF_BYPOSITION | MF_STRING, 206, L"Trim Memory Now");
    InsertMenuW(hMenu, 8, MF_BYPOSITION | MF_STRING, 207, L"Quit");

    POINT pt;
    GetCursorPos(&pt);
    SetForegroundWindow(m_hWndOwner);
    int cmd = TrackPopupMenu(hMenu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON, pt.x, pt.y, 0, m_hWndOwner, NULL);
    DestroyMenu(hMenu);

    if (cmd == 201) App_SendControl(L"playPause");
    else if (cmd == 202) App_SendControl(L"next");
    else if (cmd == 203) App_SendControl(L"previous");
    else if (cmd == 204) App_ToggleMiniplayer();
    else if (cmd == 205) {
        if (g_hMainWindow && IsWindowVisible(g_hMainWindow)) App_HideMainWindow();
        else App_ShowMainWindow();
    }
    else if (cmd == 206) App_TrimWorkingSet();
    else if (cmd == 207) App_Quit();
}
