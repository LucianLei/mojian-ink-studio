import { useGenerationAnimation } from "./use-generation-animation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  defaults,
  generate,
  processText,
  removePunctuation,
  updateText,
  applySizeVariation,
  commit,
  undo,
  redo,
  drawable,
  type History,
  type Settings,
  type Work,
  type Edit,
} from "./model";
import { loadFont, fontCanRender, type LocalFont } from "./fonts";
import { repairFonts } from "./font-fallback";
import bundledFonts from "./bundled-fonts.json";
import { draw, hit, clipped, exportPNG, type Box } from "./render";
const sample = "天地有大美而不言\n四时有明法而不议\n万物有成理而不说";
function NumberField({
  label,
  value,
  min = 0,
  max = 3000,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={`${label}滑块`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
        />
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            if (e.target.value !== "" && Number.isFinite(+e.target.value))
              onChange(Math.min(max, Math.max(min, +e.target.value)));
          }}
        />
      </div>
    </label>
  );
}
export default function App() {
  const [text, setText] = useState(sample),
    [fonts, setFonts] = useState<LocalFont[]>([]),
    [autoGenerate, setAutoGenerate] = useState(true),
    [removeNewlines, setRemoveNewlines] = useState(false),
    [composing, setComposing] = useState(false),
    [defaultsLoaded, setDefaultsLoaded] = useState(false),
    [updating, setUpdating] = useState(false),
    [animationEnabled, setAnimationEnabled] = useState(
      () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [animationMilliseconds, setAnimationMilliseconds] = useState(220),
    [animationTrigger, setAnimationTrigger] = useState(0),
    [history, setHistory] = useState<History>({
      past: [],
      present: {
        source: "",
        baseSize: defaults.size,
        glyphs: [],
        settings: defaults,
      },
      future: [],
    }),
    [selected, setSelected] = useState<string>(),
    [zoom, setZoom] = useState(0.4),
    [fit, setFit] = useState(true),
    [random, setRandom] = useState({
      font: true,
      size: true,

      offset: true,
      rotation: true,
    }),
    [message, setMessage] = useState(""),
    [exportScale, setExportScale] = useState("2"),
    [customWidth, setCustomWidth] = useState(2400),
    [customHeight, setCustomHeight] = useState(3200),
    [exportGrid, setExportGrid] = useState(false),
    [busy, setBusy] = useState(false),
    [warnings, setWarnings] = useState({ missing: 0, clipped: 0 });
  const booted = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    boxes = useRef<Box[]>([]),
    drag = useRef<
      | {
          id: string;
          x: number;
          y: number;
          before: Work;
          dx: number;
          dy: number;
          moved: boolean;
        }
      | undefined
    >(undefined);
  const work = history.present,
    s = work.settings;
  const animation = useGenerationAnimation(
    work,
    fonts,
    animationEnabled,
    animationMilliseconds,
    animationTrigger,
  );
  const chosen = work.glyphs.find((g) => g.id === selected),
    usable = fonts.filter((f) => f.enabled && f.status === "ready");
  const candidates = (t: string) =>
    usable.filter((f) => fontCanRender(f, t)).map((f) => f.id);
  const change = (next: Work) => setHistory((h) => commit(h, next));
  const setting = (patch: Partial<Settings>) =>
    change({ ...work, settings: { ...s, ...patch } });
  const edit = (patch: Partial<Edit>) => {
    if (chosen)
      change({
        ...work,
        glyphs: work.glyphs.map((g) =>
          g.id === selected ? { ...g, edit: { ...g.edit, ...patch } } : g,
        ),
      });
  };
  useLayoutEffect(() => {
    const checked = repairFonts(work, fonts);
    if (checked.work === work) return;
    setHistory((h) => ({ ...h, present: repairFonts(h.present, fonts).work }));
    if (checked.replacements)
      setMessage(
        `检测到 ${checked.replacements} 个不可显示字符，已自动换用可显示的字体。`,
      );
  }, [work, fonts]);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void Promise.all(
      bundledFonts.map(async (f) => {
        try {
          const response = await fetch(
            import.meta.env.BASE_URL + f.url.slice(1),
          );
          if (!response.ok) throw Error("默认字体下载失败");
          await upload([new File([await response.arrayBuffer()], f.name)]);
        } catch (e) {
          setMessage(`${f.name}：${(e as Error).message}`);
        }
      }),
    ).finally(() => setDefaultsLoaded(true));
  }, []);
  const randomConfig = {
    ...random,
    size: s.sizeVariationEnabled,
    sizeAmount: s.sizeVariation,
  };
  const generationRef = useRef({ random: randomConfig, candidates });
  generationRef.current = { random: randomConfig, candidates };
  const processed = processText(text, removeNewlines);
  const readyKey = usable.map((f) => f.id).join(",");
  useEffect(() => {
    if (
      !autoGenerate ||
      composing ||
      !defaultsLoaded ||
      (!usable.length && processed.trim())
    )
      return;
    const needsUpdate =
      processed !== work.source ||
      work.glyphs.some(
        (g) =>
          drawable(g.text) && !g.edit.fontId && candidates(g.text).length > 0,
      );
    if (!needsUpdate) return;
    setUpdating(true);
    const timer = window.setTimeout(() => {
      setHistory((h) => {
        const current = generationRef.current;
        if (
          h.present.source === processed &&
          !h.present.glyphs.some(
            (g) =>
              drawable(g.text) &&
              !g.edit.fontId &&
              current.candidates(g.text).length,
          )
        )
          return h;
        return commit(
          h,
          updateText(h.present, processed, current.candidates, current.random),
        );
      });
      setMessage("已自动更新，未改动字符的精修已保留。");
      setUpdating(false);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      setUpdating(false);
    };
    // Existing glyph edits and undo must not themselves schedule regeneration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processed, autoGenerate, composing, defaultsLoaded, readyKey]);
  useEffect(() => {
    if (selected && !work.glyphs.some((g) => g.id === selected))
      setSelected(undefined);
  }, [work.glyphs, selected]);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (fit)
        setZoom(
          Math.max(
            0.08,
            Math.min(
              1,
              (el.clientWidth - 64) / s.width,
              (el.clientHeight - 64) / s.height,
            ),
          ),
        );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, s.width, s.height]);
  useEffect(() => {
    if (!canvas.current) return;
    const result = draw(
      canvas.current,
      work,
      fonts,
      Math.round(s.width * zoom * devicePixelRatio),
      Math.round(s.height * zoom * devicePixelRatio),
      true,
      selected,
      animation.presentation,
    );
    boxes.current = result;
    setWarnings({
      missing: result.filter((b) => b.missing).length,
      clipped: result.filter((b) => clipped(b, s)).length,
    });
  }, [work, fonts, zoom, selected, animation.presentation]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,textarea,select") ||
          e.target.isContentEditable)
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setHistory(redo);
        return;
      }
      if (
        chosen &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        edit({
          dx:
            chosen.edit.dx +
            (e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0),
          dy:
            chosen.edit.dy +
            (e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0),
        });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [chosen, work]);
  async function upload(files: FileList | File[] | null) {
    if (!files) return;
    await Promise.all(
      Array.from(files).map((file) =>
        loadFont(file, (font) =>
          setFonts((old) =>
            old.some((f) => f.id === font.id)
              ? old.map((f) => (f.id === font.id ? font : f))
              : [...old, font],
          ),
        ),
      ),
    );
  }
  function create() {
    setAnimationTrigger((n) => n + 1);
    change(generate(processed, s, candidates, randomConfig));
    setSelected(undefined);
    setMessage("已生成，点击作品中的字即可编辑。");
  }
  function rerandom() {
    setAnimationTrigger((n) => n + 1);
    const fresh = generate(work.source, s, candidates, randomConfig);
    change({
      ...fresh,
      glyphs: fresh.glyphs.map((g, i) => ({ ...g, id: work.glyphs[i].id })),
    });
    setMessage("已整体重新随机，可撤销恢复上一个版本。");
  }
  function point(e: React.PointerEvent) {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * s.width) / rect.width,
      y: ((e.clientY - rect.top) * s.height) / rect.height,
    };
  }
  const outWidth =
      exportScale === "custom"
        ? customWidth
        : Math.round(s.width * +exportScale),
    outHeight =
      exportScale === "custom"
        ? customHeight
        : Math.round(s.height * +exportScale);
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="seal">墨</span>
          <div>
            <h1>
              墨间 <small>书法字帖工坊</small>
            </h1>
            <p>以字为景，落笔成画</p>
          </div>
        </div>
        <nav>
          <button
            className="primary"
            disabled={!usable.length || !text.trim()}
            onClick={create}
          >
            生成字帖
          </button>
          <button
            disabled={!work.glyphs.length || !usable.length}
            onClick={rerandom}
          >
            整体重新随机
          </button>
          <button
            title="⌘ / Ctrl Z"
            disabled={!history.past.length}
            onClick={() => setHistory(undo)}
          >
            撤销
          </button>
          <button
            disabled={!history.future.length}
            onClick={() => setHistory(redo)}
          >
            重做
          </button>
          <button
            className="dark"
            disabled={
              !work.glyphs.length ||
              busy ||
              updating ||
              composing ||
              animation.playing ||
              fonts.some((f) => f.status === "loading")
            }
            onClick={async () => {
              setBusy(true);
              try {
                await exportPNG(work, fonts, outWidth, outHeight, exportGrid);
                setMessage("PNG 已导出，浏览器已开始下载。");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在导出…" : "导出 PNG ↗"}
          </button>
        </nav>
      </header>
      <main>
        <aside className="left">
          <section>
            <div className="section-title">
              <h2>01 / 书写内容</h2>
              <span>本地处理</span>
            </div>
            <textarea
              aria-label="书写内容"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              spellCheck={false}
            />
            <div className="format-tools">
              <label className="check">
                <input
                  aria-label="自动生成"
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(e) => setAutoGenerate(e.target.checked)}
                />
                自动生成
              </label>
              <label className="check">
                <input
                  aria-label="删除换行"
                  type="checkbox"
                  checked={removeNewlines}
                  onChange={(e) => setRemoveNewlines(e.target.checked)}
                />
                生成时删除换行
              </label>
              <button
                disabled={!/\p{P}/u.test(text)}
                onClick={() => setText(removePunctuation(text))}
              >
                删除标点符号
              </button>
            </div>
            <p className="hint">
              {autoGenerate
                ? "停止输入后自动更新，已有字符的精修会保留。"
                : "自动生成已关闭，点击生成更新作品。"}
              {removeNewlines
                ? "换行仅在作品中移除，输入原文保留。"
                : "竖排换行表示另起一列。"}
            </p>
            <div className="animation-controls">
              <label className="check">
                <input
                  aria-label="逐字字体动画"
                  type="checkbox"
                  checked={animationEnabled}
                  onChange={(e) => setAnimationEnabled(e.target.checked)}
                />
                逐字字体轮转动画
              </label>
              <NumberField
                label="每字动画时长（毫秒）"
                value={animationMilliseconds}
                min={80}
                max={600}
                step={20}
                onChange={setAnimationMilliseconds}
              />
              <p className="hint">
                每字轮转字体后定格，再生成下一个字；新增文字只动画新增字符。
              </p>
            </div>
            <h3>自然书写变化</h3>
            <div className="checks">
              {(["font", "size", "offset", "rotation"] as const).map((k, i) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={randomConfig[k]}
                    onChange={(e) => {
                      if (k !== "size")
                        setRandom({ ...random, [k]: e.target.checked });
                      if (k === "size")
                        change(
                          applySizeVariation(
                            work,
                            e.target.checked,
                            s.sizeVariation,
                          ),
                        );
                    }}
                  />
                  {["随机字体", "大小错落", "落笔偏移", "轻微旋转"][i]}
                </label>
              ))}
            </div>
            <NumberField
              label="大小变化幅度（%）"
              value={Math.round(s.sizeVariation * 100)}
              min={0}
              max={45}
              onChange={(amount) => {
                change(
                  applySizeVariation(
                    work,
                    s.sizeVariationEnabled,
                    amount / 100,
                  ),
                );
              }}
            />
            <p className="hint">
              默认 ±22%，最高 ±45%。仅调整大小，不重抽字体与位置。
            </p>
            <label className="check">
              <input
                aria-label="视觉协调"
                type="checkbox"
                checked={s.balance}
                onChange={(e) => setting({ balance: e.target.checked })}
              />
              自动协调字形大小与笔画粗细
            </label>
            <NumberField
              label="视觉协调强度（%）"
              value={Math.round(s.balanceStrength * 100)}
              min={0}
              max={100}
              onChange={(value) => setting({ balanceStrength: value / 100 })}
            />
            <p className="hint">
              适度补强细笔画，保留字体自身笔意；单字面板可额外加粗。
            </p>
          </section>
          <section>
            <div className="section-title">
              <h2>02 / 字体收藏</h2>
              <span>{usable.length} 款可用</span>
            </div>
            <label
              className="upload"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void upload(e.dataTransfer.files);
              }}
            >
              <strong>＋ 上传或拖入字体</strong>
              <span>TTF · OTF · TTC / 支持多选</span>
              <input
                aria-label="上传字体"
                type="file"
                accept=".ttf,.otf,.ttc"
                multiple
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {!fonts.length && (
              <p className="hint">
                字体不会离开你的设备。请上传你有权使用的书法字体。
              </p>
            )}
            <div className="font-list">
              {fonts.map((f) => (
                <article
                  className={`font-card ${f.status === "error" ? "failed" : ""}`}
                  key={f.id}
                >
                  <div>
                    <label>
                      <input
                        aria-label={`启用${f.name}`}
                        type="checkbox"
                        checked={f.enabled}
                        disabled={f.status !== "ready"}
                        onChange={(e) =>
                          setFonts(
                            fonts.map((x) =>
                              x.id === f.id
                                ? { ...x, enabled: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                      <b title={f.name}>{f.name}</b>
                    </label>
                    <button
                      aria-label={`删除${f.name}`}
                      onClick={() => {
                        if (f.face) document.fonts.delete(f.face);
                        setFonts(fonts.filter((x) => x.id !== f.id));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <span className="status">
                    {f.status === "ready"
                      ? "已加载"
                      : f.status === "loading"
                        ? "加载中…"
                        : `加载失败：${f.error}`}
                  </span>
                  {f.status === "ready" && (
                    <p style={{ fontFamily: f.family }}>
                      {Array.from("清風明月")
                        .filter((c) => fontCanRender(f, c))
                        .join("") || "此字体不覆盖示例汉字"}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </aside>
        <div className="workspace">
          <div className="preview-toolbar">
            <span>
              作品预览{" "}
              <small>
                {s.width} × {s.height} px
              </small>
            </span>
            <div>
              <button
                onClick={() => setFit(true)}
                className={fit ? "active" : ""}
              >
                适应窗口
              </button>
              <input
                aria-label="预览缩放"
                type="range"
                min=".08"
                max="1.5"
                step=".01"
                value={zoom}
                onChange={(e) => {
                  setFit(false);
                  setZoom(+e.target.value);
                }}
              />
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </div>
          {animation.playing && (
            <div
              className="animation-status"
              role="status"
              aria-label="字体生成动画状态"
            >
              <span>
                落字成篇 <b>「{animation.activeText}」</b> ·{" "}
                {animation.completed + 1} / {animation.total}
              </span>
              <button onClick={animation.skip}>跳过动画</button>
            </div>
          )}
          <div className="stage" ref={stage}>
            <canvas
              ref={canvas}
              tabIndex={0}
              aria-label="书法作品画布"
              style={{ width: s.width * zoom, height: s.height * zoom }}
              onPointerDown={(e) => {
                canvas.current!.focus({ preventScroll: true });
                const p = point(e),
                  b = hit(boxes.current, p.x, p.y);
                setSelected(b?.slot.glyph.id);
                if (b) {
                  canvas.current!.setPointerCapture(e.pointerId);
                  drag.current = {
                    id: b.slot.glyph.id,
                    ...p,
                    before: work,
                    dx: b.slot.glyph.edit.dx,
                    dy: b.slot.glyph.edit.dy,
                    moved: false,
                  };
                }
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const p = point(e);
                if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) < 1 && !d.moved)
                  return;
                d.moved = true;
                setHistory((h) => ({
                  ...h,
                  present: {
                    ...d.before,
                    glyphs: d.before.glyphs.map((g) =>
                      g.id === d.id
                        ? {
                            ...g,
                            edit: {
                              ...g.edit,
                              dx: d.dx + p.x - d.x,
                              dy: d.dy + p.y - d.y,
                            },
                          }
                        : g,
                    ),
                  },
                }));
              }}
              onPointerUp={() => {
                const d = drag.current;
                if (d?.moved)
                  setHistory((h) => ({
                    past: [...h.past.slice(-79), d.before],
                    present: h.present,
                    future: [],
                  }));
                drag.current = undefined;
              }}
              onPointerCancel={() => {
                const d = drag.current;
                if (d) setHistory((h) => ({ ...h, present: d.before }));
                drag.current = undefined;
              }}
            />
            {!work.glyphs.length && (
              <div className="empty">
                <span>書</span>
                <h2>让每一个字，都有自己的笔意</h2>
                <p>输入文字，字体加载完成后自动显示作品</p>
              </div>
            )}
          </div>
          <div className="notice" role="status" aria-label="作品状态">
            {!usable.length
              ? "请先上传并启用一款成功加载的字体。"
              : updating
                ? "正在更新字帖…"
                : warnings.missing
                  ? `${warnings.missing} 个字符缺少可用字形，已用红框标记。`
                  : message ||
                    "点击选字 · 拖动微调 · 方向键移动 · Shift 加大步长"}
            {warnings.clipped > 0 && (
              <strong>
                {" "}
                {warnings.clipped} 个字符超出画布或被裁切，请调整排版。
              </strong>
            )}
          </div>
        </div>
        <aside className="right">
          <section>
            <h2>03 / 画布与排版</h2>
            <div className="inline">
              <label>
                比例
                <select
                  aria-label="画布比例"
                  defaultValue="custom"
                  onChange={(e) => {
                    if (e.target.value !== "custom") {
                      const [a, b] = e.target.value.split(":").map(Number);
                      setting({ height: Math.round((s.width * b) / a) });
                    }
                  }}
                >
                  <option value="custom">自定义</option>
                  {["1:1", "4:3", "3:4", "16:9", "9:16"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <NumberField
              label="画布宽度"
              value={s.width}
              min={200}
              max={4000}
              onChange={(width) => setting({ width })}
            />
            <NumberField
              label="画布高度"
              value={s.height}
              min={200}
              max={4000}
              onChange={(height) => setting({ height })}
            />
            <label className="select-row">
              书写方向
              <select
                aria-label="书写方向"
                value={s.direction}
                onChange={(e) =>
                  setting({
                    direction: e.target.value as Settings["direction"],
                  })
                }
              >
                <option value="ltr">横排 · 从左到右</option>
                <option value="rtl">横排 · 从右到左</option>
                <option value="vertical">竖排 · 从上到下</option>
              </select>
            </label>
            {s.direction === "vertical" && (
              <label className="select-row">
                列方向
                <select
                  aria-label="列方向"
                  value={s.columns}
                  onChange={(e) =>
                    setting({ columns: e.target.value as Settings["columns"] })
                  }
                >
                  <option value="rtl">从右到左</option>
                  <option value="ltr">从左到右</option>
                </select>
              </label>
            )}
            <div className="arrangement-panel">
              <h3>自由章法</h3>
              <div className="preset-buttons">
                <button
                  className={s.arrangement === "regular" ? "active" : ""}
                  onClick={() => setting({ arrangement: "regular" })}
                >
                  规整
                </button>
                <button
                  className={
                    s.arrangement === "free" && s.looseness < 0.8
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setting({ arrangement: "free", looseness: 0.65 })
                  }
                >
                  自然
                </button>
                <button
                  className={
                    s.arrangement === "free" && s.looseness >= 0.8
                      ? "active"
                      : ""
                  }
                  onClick={() => setting({ arrangement: "free", looseness: 1 })}
                >
                  奔放
                </button>
              </div>
              <NumberField
                label="错落强度（%）"
                value={
                  s.arrangement === "regular"
                    ? 0
                    : Math.round(s.looseness * 100)
                }
                min={0}
                max={100}
                onChange={(value) =>
                  setting({
                    arrangement: value === 0 ? "regular" : "free",
                    looseness: value / 100,
                  })
                }
              />
              <p className="hint">
                字距疏密、行列起伏、落字偏移与倾斜同步变化；调节强度保留同一组随机走势与手动精修。
              </p>
            </div>
            <details>
              <summary>四边留白</summary>
              {(["top", "right", "bottom", "left"] as const).map((key, i) => (
                <NumberField
                  key={key}
                  label={["上留白", "右留白", "下留白", "左留白"][i]}
                  value={s[key]}
                  max={1500}
                  onChange={(v) => setting({ [key]: v })}
                />
              ))}
            </details>
            <NumberField
              label="默认字号"
              value={s.size}
              min={12}
              max={300}
              onChange={(size) => setting({ size })}
            />
            <NumberField
              label="默认缩放"
              value={s.scale}
              min={0.2}
              max={3}
              step={0.01}
              onChange={(scale) => setting({ scale })}
            />
            <NumberField
              label="字间距"
              value={s.gap}
              min={-100}
              max={200}
              onChange={(gap) => setting({ gap })}
            />
            <NumberField
              label="行 / 列间距"
              value={s.line}
              min={-100}
              max={200}
              onChange={(line) => setting({ line })}
            />
            <div className="colors">
              <label>
                墨色
                <input
                  aria-label="文字颜色"
                  type="color"
                  value={s.ink}
                  onChange={(e) => setting({ ink: e.target.value })}
                />
              </label>
              <label>
                纸色
                <input
                  aria-label="背景颜色"
                  type="color"
                  value={s.paper}
                  onChange={(e) => setting({ paper: e.target.value })}
                />
              </label>
            </div>
            <label className="select-row">
              背景
              <select
                aria-label="背景"
                value={s.background}
                onChange={(e) =>
                  setting({
                    background: e.target.value as Settings["background"],
                  })
                }
              >
                <option value="paper">细纹宣纸</option>
                <option value="solid">纯色</option>
                <option value="transparent">透明</option>
              </select>
            </label>
            <label className="select-row">
              辅助线
              <select
                aria-label="辅助线"
                value={s.grid}
                onChange={(e) =>
                  setting({ grid: e.target.value as Settings["grid"] })
                }
              >
                <option value="none">无</option>
                <option value="square">田字格</option>
                <option value="rice">米字格</option>
              </select>
            </label>
          </section>
          <section>
            <div className="section-title">
              <h2>04 / 单字精修</h2>
              <span>{chosen ? `「${chosen.text}」` : "未选中"}</span>
            </div>
            {chosen && drawable(chosen.text) ? (
              <>
                <label className="select-row">
                  字体
                  <select
                    aria-label="单字字体"
                    value={chosen.edit.fontId ?? ""}
                    onChange={(e) => edit({ fontId: e.target.value || null })}
                  >
                    <option value="">缺字 / 未指定</option>
                    {fonts
                      .filter(
                        (f) =>
                          f.status === "ready" &&
                          fontCanRender(f, chosen.text) &&
                          (f.enabled || f.id === chosen.edit.fontId),
                      )
                      .map((f) => (
                        <option value={f.id} key={f.id}>
                          {f.name}
                          {!f.enabled ? "（已停用）" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="inline">
                  <button
                    disabled={!candidates(chosen.text).length}
                    onClick={() => {
                      const ids = candidates(chosen.text).filter(
                        (id) => id !== chosen.edit.fontId,
                      );
                      if (ids.length)
                        edit({
                          fontId: ids[Math.floor(Math.random() * ids.length)],
                        });
                    }}
                  >
                    随机换一种字体
                  </button>
                  <button onClick={() => edit({ ...chosen.initial })}>
                    恢复默认
                  </button>
                </div>
                {(
                  [
                    {
                      key: "size",
                      label: "单字字号",
                      min: 8,
                      max: 400,
                      step: 1,
                    },
                    {
                      key: "stroke",
                      label: "单字加粗",
                      min: 0,
                      max: 4,
                      step: 0.1,
                    },
                    {
                      key: "scale",
                      label: "整体缩放",
                      min: 0.1,
                      max: 4,
                      step: 0.01,
                    },
                    {
                      key: "sx",
                      label: "水平缩放",
                      min: 0.1,
                      max: 4,
                      step: 0.01,
                    },
                    {
                      key: "sy",
                      label: "垂直缩放",
                      min: 0.1,
                      max: 4,
                      step: 0.01,
                    },
                    {
                      key: "rotation",
                      label: "旋转角度",
                      min: -180,
                      max: 180,
                      step: 0.1,
                    },
                    {
                      key: "dx",
                      label: "X 偏移",
                      min: -3000,
                      max: 3000,
                      step: 1,
                    },
                    {
                      key: "dy",
                      label: "Y 偏移",
                      min: -3000,
                      max: 3000,
                      step: 1,
                    },
                  ] as const
                ).map((f) => (
                  <NumberField
                    key={f.key}
                    label={f.label}
                    value={chosen.edit[f.key]}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    onChange={(v) => edit({ [f.key]: v })}
                  />
                ))}
                <p className="hint">
                  偏移相对于逻辑槽位；全局排版调整会保留精修参数。
                </p>
              </>
            ) : (
              <p className="hint">点击画布中的字，或从下方字符列表选择。</p>
            )}
            <div className="glyph-list">
              {work.glyphs
                .filter((g) => drawable(g.text))
                .map((g, i) => (
                  <button
                    aria-label={`选择字符${i + 1}${g.text}`}
                    title={`第 ${i + 1} 字`}
                    className={selected === g.id ? "active" : ""}
                    key={g.id}
                    onClick={() => setSelected(g.id)}
                  >
                    {g.text}
                  </button>
                ))}
            </div>
          </section>
          <section>
            <h2>05 / 高清输出</h2>
            <label className="select-row">
              输出倍率
              <select
                aria-label="输出倍率"
                value={exportScale}
                onChange={(e) => setExportScale(e.target.value)}
              >
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
                <option value="custom">自定义像素</option>
              </select>
            </label>
            {exportScale === "custom" && (
              <>
                <NumberField
                  label="导出宽度"
                  value={customWidth}
                  min={1}
                  max={16384}
                  onChange={setCustomWidth}
                />
                <NumberField
                  label="导出高度"
                  value={customHeight}
                  min={1}
                  max={16384}
                  onChange={setCustomHeight}
                />
                <p className="hint">建议保持画布比例，其他比例会拉伸作品。</p>
              </>
            )}
            <p className="output-size">
              {outWidth} × {outHeight} <small>px</small>
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={exportGrid}
                onChange={(e) => setExportGrid(e.target.checked)}
              />
              导出包含辅助线
            </label>
            <p className="hint">透明背景直接输出透明 PNG。最高 3200 万像素。</p>
          </section>
        </aside>
      </main>
      <footer>
        墨间 / INK STUDIO <span>字体与作品留在本机 · 无需联网</span>
      </footer>
    </div>
  );
}
