import type { Mode, Snippet, ToUi, ToWidget } from "../shared/messages.ts";
import {
  type CodeRef,
  contentsApiUrl,
  describeHttpFailure,
  isPinned,
  parsePermalink,
  permalinkUrl,
  shortLabel,
  sliceLines,
} from "../shared/permalink.ts";

const { widget } = figma;
const { AutoLayout, SVG, Text, usePropertyMenu, useSyncedState, useWidgetNodeId } =
  widget;

const TOKEN_KEY = "github-token";
const MAX_LINES = 500;

const CODE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4" fill="none" stroke="#57606A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

async function readToken(): Promise<string | null> {
  const token: unknown = await figma.clientStorage.getAsync(TOKEN_KEY);
  return typeof token === "string" && token !== "" ? token : null;
}

async function fetchSnippet(ref: CodeRef): Promise<Snippet> {
  const token = await readToken();
  const headers: { [name: string]: string } = {
    Accept: "application/vnd.github.raw+json",
  };
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(contentsApiUrl(ref), { headers });
  if (!response.ok) {
    throw new Error(describeHttpFailure(response.status, token !== null));
  }
  const lines = sliceLines(await response.text(), ref.startLine, ref.endLine, MAX_LINES);
  return { ref, ...lines, fetchedAt: new Date().toISOString() };
}

function Widget() {
  const [snippet, setSnippet] = useSyncedState<Snippet | null>("snippet", null);
  const widgetId = useWidgetNodeId();

  async function openOverlay(mode: Mode): Promise<void> {
    let current = snippet;
    const node = await figma.getNodeByIdAsync(widgetId);
    const box =
      node !== null && "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
    figma.showUI(__html__, {
      title: current === null ? "Code reference" : shortLabel(current.ref),
      width: 720,
      height: 480,
      themeColors: true,
      position: box === null ? undefined : { x: box.x + box.width + 16, y: box.y },
    });
    const post = (message: ToUi) => figma.ui.postMessage(message);
    post({ type: "init", mode, snippet: current, hasToken: (await readToken()) !== null });

    async function load(ref: CodeRef) {
      const next = await fetchSnippet(ref);
      setSnippet(next);
      current = next;
      post({ type: "snippet", snippet: next });
    }

    return new Promise<void>((resolve) => {
      figma.on("close", resolve);
      figma.ui.onmessage = async (message: ToWidget) => {
        try {
          switch (message.type) {
            case "fetch":
              await load(parsePermalink(message.permalink));
              break;
            case "refresh":
              if (current !== null) {
                await load(current.ref);
              }
              break;
            case "open":
              if (current !== null) {
                figma.openExternal(permalinkUrl(current.ref));
              }
              break;
            case "set-token":
              await figma.clientStorage.setAsync(TOKEN_KEY, message.token.trim());
              post({ type: "token", hasToken: true });
              break;
            case "clear-token":
              await figma.clientStorage.deleteAsync(TOKEN_KEY);
              post({ type: "token", hasToken: false });
              break;
            case "close":
              figma.closePlugin();
              break;
          }
        } catch (error) {
          post({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      };
    });
  }

  usePropertyMenu(
    snippet === null
      ? []
      : [
          { itemType: "action", propertyName: "github", tooltip: "Open in GitHub" },
          { itemType: "action", propertyName: "edit", tooltip: "Change permalink" },
        ],
    async ({ propertyName }) => {
      if (snippet === null) {
        return;
      }
      if (propertyName === "github") {
        figma.openExternal(permalinkUrl(snippet.ref));
      }
      if (propertyName === "edit") {
        await openOverlay("edit");
      }
    },
  );

  if (snippet === null) {
    return (
      <AutoLayout
        name="Code reference"
        verticalAlignItems="center"
        spacing={8}
        padding={{ vertical: 10, horizontal: 14 }}
        cornerRadius={8}
        fill="#FFFFFF"
        stroke="#D0D7DE"
        hoverStyle={{ fill: "#F6F8FA" }}
        onClick={() => openOverlay("edit")}
      >
        <SVG src={CODE_ICON} />
        <Text fontSize={14} fill="#57606A">
          Add code reference
        </Text>
      </AutoLayout>
    );
  }

  const { ref } = snippet;
  const version = isPinned(ref.ref) ? ref.ref.slice(0, 7) : `${ref.ref} (not pinned)`;
  return (
    <AutoLayout
      name={shortLabel(ref)}
      direction="vertical"
      spacing={2}
      padding={{ vertical: 8, horizontal: 12 }}
      cornerRadius={8}
      fill="#FFFFFF"
      stroke="#D0D7DE"
      hoverStyle={{ fill: "#F6F8FA" }}
      tooltip={`${ref.owner}/${ref.repo}/${ref.path}`}
      onClick={() => openOverlay("view")}
    >
      <AutoLayout verticalAlignItems="center" spacing={6}>
        <SVG src={CODE_ICON} />
        <Text fontFamily="Roboto Mono" fontSize={14} fontWeight={600} fill="#1F2328">
          {shortLabel(ref)}
        </Text>
      </AutoLayout>
      <Text fontSize={11} fill="#57606A">
        {`${ref.owner}/${ref.repo} @ ${version}`}
      </Text>
    </AutoLayout>
  );
}

widget.register(Widget);
