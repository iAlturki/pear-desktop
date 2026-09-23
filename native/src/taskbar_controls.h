#pragma once

#include "app.h"
#include <shobjidl.h>

#define THUMB_BTN_PREV 1001
#define THUMB_BTN_PLAYPAUSE 1002
#define THUMB_BTN_NEXT 1003

class TaskbarControls {
public:
    static TaskbarControls& Instance();

    void Initialize(HWND hWnd);
    void UpdateState(const SongInfo& song);
    bool HandleCommand(WORD cmdId);
    UINT GetTaskbarCreatedMsg() const { return m_wmTaskbarCreated; }
    void OnTaskbarButtonCreated();

private:
    TaskbarControls();
    ~TaskbarControls();

    void CreateThumbButtons();
    HICON CreateButtonIcon(int type); // 0 = play, 1 = pause, 2 = next, 3 = prev

    HWND m_hWnd = nullptr;
    ITaskbarList3* m_pTaskbar = nullptr;
    UINT m_wmTaskbarCreated = 0;
    bool m_buttonsAdded = false;

    HICON m_hIconPlay = nullptr;
    HICON m_hIconPause = nullptr;
    HICON m_hIconNext = nullptr;
    HICON m_hIconPrev = nullptr;
};
