# Шрифты сайта

Файлы из [google/fonts](https://github.com/google/fonts) (лицензия SIL Open Font License 1.1 —
тексты лицензий `OFL-*.txt` рядом), обрезаны до нужных символов, чтобы страницы грузились быстрее.
Подключаются в `app/fonts.ts` через `next/font/local` — сборка не обращается к интернету.

| Файл | Шрифт | Где |
|---|---|---|
| `prata-400.woff2` | Prata Regular | заголовки |
| `golos-text-400-600.woff2` | Golos Text, вариативный 400–600 | основной текст |
| `ibm-plex-mono-400/500.woff2` | IBM Plex Mono | мелкие подписи, кикеры |
| `spectral-logo-500/600.woff2` | Spectral, только буквы «НСБ ЧАЙ» | логотип |

Иероглифы — системным китайским шрифтом (Songti SC на Apple, Noto Serif CJK на Android и Linux).

Пересобрать (нужен Python и [uv](https://docs.astral.sh/uv/); исходные TTF — из `ofl/<шрифт>/`
репозитория google/fonts):

```sh
U="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2000-206F,U+20AC,U+20BD,U+2116,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD"
uvx --from "fonttools[woff]" fonttools varLib.instancer "GolosText[wght].ttf" wght=400:600 -o golos.ttf
uvx --from "fonttools[woff]" pyftsubset golos.ttf --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file=golos-text-400-600.woff2
uvx --from "fonttools[woff]" pyftsubset Prata-Regular.ttf --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file=prata-400.woff2
uvx --from "fonttools[woff]" pyftsubset IBMPlexMono-Regular.ttf --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file=ibm-plex-mono-400.woff2
uvx --from "fonttools[woff]" pyftsubset IBMPlexMono-Medium.ttf --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file=ibm-plex-mono-500.woff2
uvx --from "fonttools[woff]" pyftsubset Spectral-Medium.ttf --text="НСБЧАЙнсбчай " --layout-features='*' --flavor=woff2 --output-file=spectral-logo-500.woff2
uvx --from "fonttools[woff]" pyftsubset Spectral-SemiBold.ttf --text="НСБЧАЙнсбчай " --layout-features='*' --flavor=woff2 --output-file=spectral-logo-600.woff2
```
