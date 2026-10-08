"use client";

import { useEffect } from "react";

export const UNSAVED_MESSAGE = "Есть несохранённые изменения. Уйти со страницы без сохранения?";

/**
 * Пока в форме есть несохранённые изменения:
 * - при закрытии вкладки или обновлении страницы браузер переспросит (beforeunload);
 * - при переходе по ссылке внутри админки спросим сами — переход только после «ОК».
 */
export function useUnsavedChanges(dirty: boolean, message = UNSAVED_MESSAGE): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // старые браузеры показывают окно, только если задан returnValue
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // уход на другой сайт поймает beforeunload
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    // в фазе перехвата — раньше, чем ссылка Next.js начнёт переход
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
