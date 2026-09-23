#include "taskbar_controls.h"
#include <objbase.h>
#include <gdiplus.h>

using namespace Gdiplus;

TaskbarControls& TaskbarControls::Instance() {
    static TaskbarControls instance;
    return instance;
}

TaskbarControls::TaskbarControls() {
    m_wmTaskbarCreated = RegisterWindowMessageW(L"TaskbarButtonCreated");
}

TaskbarControls::~TaskbarControls() {
    if (m_hIconPlay) DestroyIcon(m_hIconPlay);
    if (m_hIconPause) DestroyIcon(m_hIconPause);
    if (m_hIconNext) DestroyIcon(m_hIconNext);
    if (m_hIconPrev) DestroyIcon(m_hIconPrev);
    if (m_pTaskbar) {
        m_pTaskbar->Release();
        m_pTaskbar = nullptr;
    }
}

HICON TaskbarControls::CreateButtonIcon(int type) {
    const int sz = 20;
    Bitmap bmp(sz, sz, PixelFormat32bppARGB);
    Graphics g(&bmp);
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    g.Clear(Color(0, 0, 0, 0));

    SolidBrush brush(Color(255, 255, 255, 255));
    Pen pen(Color(255, 255, 255, 255), 1.5f);

    float mid = sz / 2.0f;

    if (type == 0) {
        // Play triangle
        PointF pts[3] = { { mid - 4.0f, mid - 6.0f }, { mid + 6.0f, mid }, { mid - 4.0f, mid + 6.0f } };
        g.FillPolygon(&brush, pts, 3);
    } else if (type == 1) {
        // Pause bars
        g.FillRectangle(&brush, mid - 5.0f, mid - 6.0f, 3.5f, 12.0f);
        g.FillRectangle(&brush, mid + 1.5f, mid - 6.0f, 3.5f, 12.0f);
    } else if (type == 2) {
        // Next Track
        PointF pts[3] = { { mid - 4.0f, mid - 6.0f }, { mid + 4.0f, mid }, { mid - 4.0f, mid + 6.0f } };
        g.FillPolygon(&brush, pts, 3);
        g.DrawLine(&pen, mid + 4.5f, mid - 6.0f, mid + 4.5f, mid + 6.0f);
    } else if (type == 3) {
        // Previous Track
        PointF pts[3] = { { mid + 4.0f, mid - 6.0f }, { mid - 4.0f, mid }, { mid + 4.0f, mid + 6.0f } };
        g.FillPolygon(&brush, pts, 3);
        g.DrawLine(&pen, mid - 4.5f, mid - 6.0f, mid - 4.5f, mid + 6.0f);
    }

    HICON hIcon = nullptr;
    bmp.GetHICON(&hIcon);
    return hIcon;
}

void TaskbarControls::Initialize(HWND hWnd) {
    m_hWnd = hWnd;
    ChangeWindowMessageFilterEx(hWnd, m_wmTaskbarCreated, MSGFLT_ALLOW, NULL);
}

void TaskbarControls::OnTaskbarButtonCreated() {
    if (!m_pTaskbar) {
        HRESULT hr = CoCreateInstance(CLSID_TaskbarList, NULL, CLSCTX_INPROC_SERVER, IID_ITaskbarList3, (void**)&m_pTaskbar);
        if (SUCCEEDED(hr) && m_pTaskbar) {
            m_pTaskbar->HrInit();
        }
    }

    if (m_pTaskbar && !m_buttonsAdded) {
        CreateThumbButtons();
    }
}

void TaskbarControls::CreateThumbButtons() {
    if (!m_pTaskbar || m_buttonsAdded || !m_hWnd) return;

    if (!m_hIconPlay) m_hIconPlay = CreateButtonIcon(0);
    if (!m_hIconPause) m_hIconPause = CreateButtonIcon(1);
    if (!m_hIconNext) m_hIconNext = CreateButtonIcon(2);
    if (!m_hIconPrev) m_hIconPrev = CreateButtonIcon(3);

    THUMBBUTTON buttons[3] = {};

    // 0: Previous
    buttons[0].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
    buttons[0].iId = THUMB_BTN_PREV;
    buttons[0].hIcon = m_hIconPrev;
    wcscpy_s(buttons[0].szTip, L"Previous Track");
    buttons[0].dwFlags = THBF_ENABLED;

    // 1: Play / Pause
    buttons[1].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
    buttons[1].iId = THUMB_BTN_PLAYPAUSE;
    buttons[1].hIcon = g_currentSong.isPaused ? m_hIconPlay : m_hIconPause;
    wcscpy_s(buttons[1].szTip, g_currentSong.isPaused ? L"Play" : L"Pause");
    buttons[1].dwFlags = THBF_ENABLED;

    // 2: Next
    buttons[2].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
    buttons[2].iId = THUMB_BTN_NEXT;
    buttons[2].hIcon = m_hIconNext;
    wcscpy_s(buttons[2].szTip, L"Next Track");
    buttons[2].dwFlags = THBF_ENABLED;

    HRESULT hr = m_pTaskbar->ThumbBarAddButtons(m_hWnd, 3, buttons);
    if (SUCCEEDED(hr)) {
        m_buttonsAdded = true;
    }
}

void TaskbarControls::UpdateState(const SongInfo& song) {
    if (!m_pTaskbar || !m_buttonsAdded || !m_hWnd) return;

    // Update Play/Pause thumbnail button
    THUMBBUTTON btn = {};
    btn.dwMask = THB_ICON | THB_TOOLTIP;
    btn.iId = THUMB_BTN_PLAYPAUSE;
    btn.hIcon = song.isPaused ? m_hIconPlay : m_hIconPause;
    wcscpy_s(btn.szTip, song.isPaused ? L"Play" : L"Pause");
    m_pTaskbar->ThumbBarUpdateButtons(m_hWnd, 1, &btn);

    // Update Hover Thumbnail Tooltip
    std::wstring tip = song.title + L" - " + song.artist;
    if (tip.length() > 250) tip = tip.substr(0, 247) + L"...";
    m_pTaskbar->SetThumbnailTooltip(m_hWnd, tip.c_str());

    // Update Taskbar Progress Bar on the icon
    if (song.duration > 0 && !song.isPaused) {
        m_pTaskbar->SetProgressState(m_hWnd, TBPF_NORMAL);
        m_pTaskbar->SetProgressValue(m_hWnd, (ULONGLONG)song.currentTime, (ULONGLONG)song.duration);
    } else {
        m_pTaskbar->SetProgressState(m_hWnd, TBPF_NOPROGRESS);
    }
}

bool TaskbarControls::HandleCommand(WORD cmdId) {
    if (cmdId == THUMB_BTN_PREV) {
        App_SendControl(L"previous");
        return true;
    }
    if (cmdId == THUMB_BTN_PLAYPAUSE) {
        App_SendControl(L"playPause");
        return true;
    }
    if (cmdId == THUMB_BTN_NEXT) {
        App_SendControl(L"next");
        return true;
    }
    return false;
}
