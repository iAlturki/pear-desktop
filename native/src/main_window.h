#pragma once

#include "app.h"

class MainWindow {
public:
    static MainWindow& Instance();

    bool Create();
    void Show();
    void Hide();
    bool IsVisible() const;

    HWND GetHwnd() const { return m_hWnd; }

private:
    MainWindow();
    ~MainWindow();

    static LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);
    void DrawTitlebar(HDC hdc, int width, int height);

    HWND m_hWnd = nullptr;
    bool m_isVisible = true;
};
