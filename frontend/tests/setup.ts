import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// findBy*/waitFor ждут появления элемента до 5 с (по умолчанию 1 с): под нагрузкой в CI
// и при параллельных прогонах загрузка данных в тестах иногда дольше секунды
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});

// jsdom не умеет того, что есть в браузере, — заглушки для библиотек интерфейса (cmdk, radix)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
