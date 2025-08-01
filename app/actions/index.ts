import flattenDeep from "lodash/flattenDeep";
import { toast } from "sonner";
import { Optional } from "utility-types";
import { v4 as uuidv4 } from "uuid";
import {
  Action,
  ActionContext,
  ActionV2,
  ActionV2Group,
  ActionV2Separator as TActionV2Separator,
  ActionV2Variant,
  ActionV2WithChildren,
  CommandBarAction,
  ExternalLinkActionV2,
  InternalLinkActionV2,
  MenuExternalLink,
  MenuInternalLink,
  MenuItem,
  MenuItemButton,
  MenuItemWithChildren,
} from "~/types";
import Analytics from "~/utils/Analytics";
import history from "~/utils/history";

function resolve<T>(value: any, context: ActionContext): T {
  return typeof value === "function" ? value(context) : value;
}

export function createAction(definition: Optional<Action, "id">): Action {
  return {
    ...definition,
    perform: definition.perform
      ? (context) => {
          // We must use the specific analytics name here as the action name is
          // translated and potentially contains user strings.
          if (definition.analyticsName) {
            Analytics.track("perform_action", definition.analyticsName, {
              context: context.isButton
                ? "button"
                : context.isCommandBar
                  ? "commandbar"
                  : "contextmenu",
            });
          }
          return definition.perform?.(context);
        }
      : undefined,
    id: definition.id ?? uuidv4(),
  };
}

export function actionToMenuItem(
  action: Action,
  context: ActionContext
): MenuItemButton | MenuExternalLink | MenuInternalLink | MenuItemWithChildren {
  const resolvedIcon = resolve<React.ReactElement<any>>(action.icon, context);
  const resolvedChildren = resolve<Action[]>(action.children, context);
  const visible = action.visible ? action.visible(context) : true;
  const title = resolve<string>(action.name, context);
  const icon =
    resolvedIcon && action.iconInContextMenu !== false
      ? resolvedIcon
      : undefined;

  if (resolvedChildren) {
    const items = resolvedChildren
      .map((a) => actionToMenuItem(a, context))
      .filter(Boolean)
      .filter((a) => a.visible);

    return {
      type: "submenu",
      title,
      icon,
      items,
      visible: visible && items.length > 0,
    };
  }

  if (action.to) {
    return typeof action.to === "string"
      ? {
          type: "route",
          title,
          icon,
          visible,
          to: action.to,
          selected: action.selected?.(context),
        }
      : {
          type: "link",
          title,
          icon,
          visible,
          href: action.to,
          selected: action.selected?.(context),
        };
  }

  return {
    type: "button",
    title,
    icon,
    visible,
    dangerous: action.dangerous,
    onClick: () => performAction(action, context),
    selected: action.selected?.(context),
  };
}

export function actionToKBar(
  action: Action,
  context: ActionContext
): CommandBarAction[] {
  if (typeof action.visible === "function" && !action.visible(context)) {
    return [];
  }

  const resolvedIcon = resolve<React.ReactElement>(action.icon, context);
  const resolvedChildren = resolve<Action[]>(action.children, context);
  const resolvedSection = resolve<string>(action.section, context);
  const resolvedName = resolve<string>(action.name, context);
  const resolvedPlaceholder = resolve<string>(action.placeholder, context);
  const children = resolvedChildren
    ? flattenDeep(resolvedChildren.map((a) => actionToKBar(a, context))).filter(
        (a) => !!a
      )
    : [];

  const sectionPriority =
    typeof action.section !== "string" && "priority" in action.section
      ? ((action.section.priority as number) ?? 0)
      : 0;

  return [
    {
      id: action.id,
      name: resolvedName,
      analyticsName: action.analyticsName,
      section: resolvedSection,
      placeholder: resolvedPlaceholder,
      keywords: action.keywords ?? "",
      shortcut: action.shortcut || [],
      icon: resolvedIcon,
      priority: (1 + (action.priority ?? 0)) * (1 + (sectionPriority ?? 0)),
      perform:
        action.perform || action.to
          ? () => performAction(action, context)
          : undefined,
    },
  ].concat(
    // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
    children.map((child) => ({ ...child, parent: child.parent ?? action.id }))
  );
}

export async function performAction(action: Action, context: ActionContext) {
  const result = action.perform
    ? action.perform(context)
    : action.to
      ? typeof action.to === "string"
        ? history.push(action.to)
        : window.open(action.to.url, action.to.target)
      : undefined;

  if (result instanceof Promise) {
    return result.catch((err: Error) => {
      toast.error(err.message);
    });
  }

  return result;
}

/** Actions V2 */

export const ActionV2Separator: TActionV2Separator = {
  type: "action_separator",
};

export function createActionV2(
  definition: Optional<Omit<ActionV2, "type" | "variant">, "id">
): ActionV2 {
  return {
    ...definition,
    type: "action",
    variant: "action",
    perform: definition.perform
      ? (context) => {
          // We must use the specific analytics name here as the action name is
          // translated and potentially contains user strings.
          if (definition.analyticsName) {
            Analytics.track("perform_action", definition.analyticsName, {
              context: context.isButton
                ? "button"
                : context.isCommandBar
                  ? "commandbar"
                  : "contextmenu",
            });
          }
          return definition.perform(context);
        }
      : () => {},
    id: definition.id ?? uuidv4(),
  };
}

export function createInternalLinkActionV2(
  definition: Optional<Omit<InternalLinkActionV2, "type" | "variant">, "id">
): InternalLinkActionV2 {
  return {
    ...definition,
    type: "action",
    variant: "internal_link",
    id: definition.id ?? uuidv4(),
  };
}

export function createExternalLinkActionV2(
  definition: Optional<Omit<ExternalLinkActionV2, "type" | "variant">, "id">
): ExternalLinkActionV2 {
  return {
    ...definition,
    type: "action",
    variant: "external_link",
    id: definition.id ?? uuidv4(),
  };
}

export function createActionV2WithChildren(
  definition: Optional<Omit<ActionV2WithChildren, "type" | "variant">, "id">
): ActionV2WithChildren {
  return {
    ...definition,
    type: "action",
    variant: "action_with_children",
    id: definition.id ?? uuidv4(),
  };
}

export function createActionV2Group(
  definition: Omit<ActionV2Group, "type">
): ActionV2Group {
  return {
    ...definition,
    type: "action_group",
  };
}

export function createRootMenuAction(
  actions: (ActionV2Variant | ActionV2Group | TActionV2Separator)[]
): ActionV2WithChildren {
  return {
    id: uuidv4(),
    type: "action",
    variant: "action_with_children",
    name: "root_action",
    section: "Root",
    children: actions,
  };
}

export function actionV2ToMenuItem(
  action: ActionV2Variant | ActionV2Group | TActionV2Separator,
  context: ActionContext
): MenuItem {
  switch (action.type) {
    case "action": {
      const title = resolve<string>(action.name, context);
      const visible = resolve<boolean>(action.visible, context);
      const icon =
        !!action.icon && action.iconInContextMenu !== false
          ? action.icon
          : undefined;

      switch (action.variant) {
        case "action":
          return {
            type: "button",
            title,
            icon,
            visible,
            dangerous: action.dangerous,
            onClick: () => performActionV2(action, context),
          };

        case "internal_link":
          return {
            type: "route",
            title,
            icon,
            visible,
            to: action.to,
          };

        case "external_link":
          return {
            type: "link",
            title,
            icon,
            visible,
            href: action.target
              ? { url: action.url, target: action.target }
              : action.url,
          };

        case "action_with_children": {
          const children = resolve<
            (ActionV2Variant | ActionV2Group | TActionV2Separator)[]
          >(action.children, context);
          const subMenuItems = children.map((a) =>
            actionV2ToMenuItem(a, context)
          );
          return {
            type: "submenu",
            title,
            icon,
            items: subMenuItems,
            visible: visible && hasVisibleItems(subMenuItems),
          };
        }

        default:
          throw Error("invalid action variant");
      }
    }

    case "action_group": {
      const groupItems = action.actions.map((a) =>
        actionV2ToMenuItem(a, context)
      );
      return {
        type: "group",
        title: resolve<string>(action.name, context),
        visible: hasVisibleItems(groupItems),
        items: groupItems,
      };
    }

    case "action_separator":
      return { type: "separator" };
  }
}

export async function performActionV2(
  action: ActionV2,
  context: ActionContext
) {
  const result = action.perform(context);

  if (result instanceof Promise) {
    return result.catch((err: Error) => {
      toast.error(err.message);
    });
  }

  return result;
}

function hasVisibleItems(items: MenuItem[]) {
  const applicableTypes = ["button", "link", "route", "group", "submenu"];
  return items.some(
    (item) => applicableTypes.includes(item.type) && item.visible
  );
}
