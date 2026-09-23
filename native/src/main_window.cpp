#include "main_window.h"
#include "webview_engine.h"
#include "taskbar_controls.h"
#include "../res/resource.h"
#include <windowsx.h>
#include <dwmapi.h>


MainWindow& MainWindow::Instance() {
    static MainWindow instance;
    return instance;
}

MainWindow::MainWindow() {}

MainWindow::~MainWindow() {
    if (m_hWnd) {
        DestroyWindow(m_hWnd);
        m_hWnd = nullptr;
    }
}

bool MainWindow::Create() {
    HINSTANCE hInst = GetModuleHandleW(NULL);
    HICON hIcon = (HICON)LoadImageW(hInst, MAKEINTRESOURCEW(IDI_APP_ICON), IMAGE_ICON, GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), LR_DEFAULTCOLOR);
    if (!hIcon) hIcon = LoadIconW(hInst, MAKEINTRESOURCEW(IDI_APP_ICON));
    HICON hIconSm = (HICON)LoadImageW(hInst, MAKEINTRESOURCEW(IDI_APP_ICON), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);
    if (!hIconSm) hIconSm = hIcon;

    WNDCLASSEXW wc = { sizeof(WNDCLASSEXW) };
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = L"YTRMusicMainWindowClass";
    wc.hIcon = hIcon;
    wc.hIconSm = hIconSm;
    wc.hCursor = LoadCursorW(NULL, (LPCWSTR)IDC_ARROW);
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    RegisterClassExW(&wc);

    // Initial position on primary monitor: centered nicely
    RECT workArea;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
    int width = 1280;
    int height = 760;
    int x = (workArea.right - width) / 2;
    int y = (workArea.bottom - height) / 2;

    m_hWnd = CreateWindowExW(
        WS_EX_APPWINDOW,
        L"YTRMusicMainWindowClass",
        L"ytr-music",
        WS_OVERLAPPEDWINDOW,
        x, y, width, height,
        NULL, NULL, hInst, this
    );

    if (!m_hWnd) return false;

    g_hMainWindow = m_hWnd;

    // Enable Windows Immersive Dark Title Bar Mode
    BOOL useDarkMode = TRUE;
    DwmSetWindowAttribute(m_hWnd, 20, &useDarkMode, sizeof(useDarkMode));
    DwmSetWindowAttribute(m_hWnd, 19, &useDarkMode, sizeof(useDarkMode));

    if (hIcon) SendMessageW(m_hWnd, WM_SETICON, ICON_BIG, (LPARAM)hIcon);
    if (hIconSm) SendMessageW(m_hWnd, WM_SETICON, ICON_SMALL, (LPARAM)hIconSm);


    static UINT s_wmShowInstance = RegisterWindowMessageW(L"YTR_MUSIC_SHOW_INSTANCE");
    ChangeWindowMessageFilterEx(m_hWnd, s_wmShowInstance, MSGFLT_ALLOW, NULL);

    // Initialize Taskbar Controls
    TaskbarControls::Instance().Initialize(m_hWnd);

    // Initialize WebView2 inside this window
    WebViewEngine::Instance().Initialize(m_hWnd, [this]() {
        RECT rc;
        GetClientRect(m_hWnd, &rc);
        WebViewEngine::Instance().Resize(rc.right, rc.bottom);
        TaskbarControls::Instance().OnTaskbarButtonCreated();
    });

    return true;
}

void MainWindow::Show() {
    if (!m_hWnd) Create();
    m_isVisible = true;
    ShowWindow(m_hWnd, SW_RESTORE);
    ShowWindow(m_hWnd, SW_SHOW);
    SetWindowPos(m_hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    SetWindowPos(m_hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    SetForegroundWindow(m_hWnd);
    SetFocus(m_hWnd);
}

void MainWindow::Hide() {
    m_isVisible = false;
    if (m_hWnd) {
        ShowWindow(m_hWnd, SW_HIDE);
    }
}

bool MainWindow::IsVisible() const {
    return m_isVisible;
}

LRESULT CALLBACK MainWindow::WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    MainWindow* self = (MainWindow*)GetWindowLongPtrW(hWnd, GWLP_USERDATA);
    if (msg == WM_NCCREATE) {
        CREATESTRUCTW* cs = (CREATESTRUCTW*)lParam;
        self = (MainWindow*)cs->lpCreateParams;
        SetWindowLongPtrW(hWnd, GWLP_USERDATA, (LONG_PTR)self);
    }

    static UINT s_wmShowInstance = RegisterWindowMessageW(L"YTR_MUSIC_SHOW_INSTANCE");
    if (msg == s_wmShowInstance) {
        if (self) {
            self->Show();
        } else {
            ShowWindow(hWnd, SW_RESTORE);
            ShowWindow(hWnd, SW_SHOW);
            SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
            SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
            SetForegroundWindow(hWnd);
            SetFocus(hWnd);
        }
        return 0;
    }

    if (msg == TaskbarControls::Instance().GetTaskbarCreatedMsg()) {
        TaskbarControls::Instance().OnTaskbarButtonCreated();
        return 0;
    }

    switch (msg) {
        case WM_COMMAND: {
            if (TaskbarControls::Instance().HandleCommand(LOWORD(wParam))) {
                return 0;
            }
            break;
        }
        case WM_SIZE: {
            int width = LOWORD(lParam);
            int height = HIWORD(lParam);
            WebViewEngine::Instance().Resize(width, height);
            return 0;
        }
        case WM_CLOSE: {
            // Minimize to system tray on close instead of exiting
            self->Hide();
            App_TrimWorkingSet();
            return 0;
        }
        case WM_DESTROY: {
            PostQuitMessage(0);
            return 0;
        }
    }

    return DefWindowProcW(hWnd, msg, wParam, lParam);
}
