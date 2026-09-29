-- Open a tab in a regular window, excluding hotkey windows.
on run argv
  set directory to item 1 of argv
  tell application id "com.googlecode.iterm2"
    set regularWindows to every window whose is hotkey window is false
    if (count of regularWindows) is 0 then
      set terminalWindow to create window with default profile
      set terminalSession to current session of terminalWindow
    else
      set terminalWindow to item 1 of regularWindows
      tell terminalWindow
        set terminalTab to create tab with default profile
        set terminalSession to current session of terminalTab
      end tell
    end if
    tell terminalSession
      write text "cd -- " & quoted form of directory
    end tell
    set miniaturized of terminalWindow to false
    select terminalWindow
    activate
  end tell
end run
