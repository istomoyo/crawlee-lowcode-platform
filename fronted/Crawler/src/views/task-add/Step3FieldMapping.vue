<template>
  <el-card class="h-full flex flex-col p-4">

    <div class="flex justify-between items-center mb-3">
      <h3 class="font-bold">字段结构映射（表格版）</h3>
      <div class="flex gap-2">
        <el-button
          v-if="!batchMode"
          size="small"
          type="primary"
          @click="enableBatchMode"
        >
          批量删除
        </el-button>
        <el-button
          v-else
          size="small"
          type="danger"
          :disabled="selectedNodes.length === 0"
          @click="confirmBatchDelete"
        >
          删除选中 ({{ selectedNodes.length }})
        </el-button>
        <el-button
          v-if="batchMode"
          size="small"
          @click="disableBatchMode"
        >
          取消批量
        </el-button>
      </div>
    </div>

    <div v-if="tableLoading" class="flex items-center justify-center py-10">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span class="ml-2 text-gray-500">加载中...</span>
    </div>
    <FieldNodeList
      v-else
      :nodes="rootNodes"
      :batch-mode="batchMode"
      :selected-nodes="selectedNodes"
      @edit="openEditDialog"
      @edit-layer="openLayerConfig"
      @remove="removeNode"
      @add-child="openAddChildDialog"
      @add-custom-child="addCustomChildNode"
      @selection-change="handleSelectionChange"
    />

    <div class="mt-4 p-3 border border-blue-200 bg-blue-50 rounded-lg">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-blue-900">根层抓取前动作（可视化）</div>
        <el-button size="small" type="primary" @click="addGlobalPreAction">添加动作</el-button>
      </div>
      <div class="text-xs text-blue-800 mt-1 mb-2">
        根层动作用于列表抓取前。每个链接页面层的动作请在对应链接节点的“页面层配置”里填写。
        点击、输入和等待元素都会自动等待页面稳定；右侧数字是“最大等待时间上限”，可留空，留空时会使用任务整体等待时间。
      </div>
      <div v-if="store.crawlerConfig.preActions.length === 0" class="text-xs text-gray-500">未配置</div>
      <div
        v-for="(action, index) in store.crawlerConfig.preActions"
        :key="`root-action-${index}`"
        class="grid grid-cols-12 gap-2 mb-2"
      >
        <el-select v-model="action.type" class="col-span-3" @change="onActionTypeChange(action)">
          <el-option label="点击" value="click" />
          <el-option label="输入文本" value="type" />
          <el-option label="等待元素" value="wait_for_selector" />
          <el-option label="等待时间" value="wait_for_timeout" />
        </el-select>
        <el-select
          v-if="action.type !== 'wait_for_timeout'"
          v-model="action.selectorType"
          class="col-span-2"
        >
          <el-option label="XPath" value="xpath" />
          <el-option label="CSS" value="css" />
        </el-select>
        <el-input
          v-if="action.type !== 'wait_for_timeout'"
          v-model="action.selector"
          :class="action.type === 'type' ? 'col-span-3' : 'col-span-5'"
          placeholder="//button[contains(.,'展开')] 或 .btn-more"
        />
        <el-input
          v-if="action.type === 'type'"
          v-model="action.value"
          class="col-span-2"
          placeholder="输入内容"
        />
        <div class="col-span-2">
          <div class="mb-1 text-[11px] leading-4 text-gray-500">
            {{ action.type === "wait_for_timeout" ? "固定等待时长(ms)" : "最大等待上限(ms)" }}
          </div>
          <el-input-number
            v-model="action.timeout"
            class="w-full"
            :min="100"
            :max="120000"
            :step="100"
            :placeholder="action.type === 'wait_for_timeout' ? '等待时长' : '留空自动'"
          />
        </div>
        <el-button class="col-span-12 justify-self-end" size="small" type="danger" text @click="removeGlobalPreAction(index)">
          删除
        </el-button>
      </div>
    </div>

    <!-- 添加新节点 -->
    <div class="mt-4">
      <div class="flex gap-2">
        <el-select v-model="newNodeType" placeholder="选择类型" size="small">
          <el-option label="字段" value="field" />
          <el-option label="图片" value="image" />
          <el-option label="链接" value="link" />
          <el-option label="分页" value="next" />
          <el-option label="滚动" value="scroll" />
        </el-select>
        <el-button type="primary" size="small" @click="addNewNode"
          >添加属性</el-button
        >
      </div>
    </div>

    <!-- 编辑弹框 -->
    <el-dialog v-model="editDialogVisible" title="编辑属性" width="760px">
      <el-form
        :model="editNode"
        ref="editForm"
        label-position="top"
        class="grid gap-4"
      >
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="text-sm font-medium text-slate-900 mb-3">基础信息</div>
          <div class="grid gap-4 md:grid-cols-2">
            <el-form-item
              v-if="isEditableExtractType(editNode.type)"
              label="属性类型"
              class="!mb-0"
            >
              <el-select v-model="editNode.type" class="w-full">
                <el-option label="字段" value="field" />
                <el-option label="图片" value="image" />
                <el-option label="链接" value="link" />
              </el-select>
            </el-form-item>

            <el-form-item label="属性名" class="!mb-0">
              <el-input v-model="editNode.label" placeholder="例如：标题、封面、详情链接" />
            </el-form-item>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-sm font-medium text-slate-900 mb-3">提取规则</div>
          <div class="grid gap-4 md:grid-cols-2">
            <el-form-item
              v-if="editNode.type !== 'scroll'"
              label="XPath"
              class="md:col-span-2 !mb-0"
            >
              <div class="w-full">
                <el-input
                  v-model="editNode.selector"
                  placeholder="//div[@class='item']"
                />
                <div
                  v-if="editNode.type !== 'next' && editNodeScopeHint"
                  class="mt-2 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600"
                >
                  <div class="flex items-center gap-2">
                    <span>匹配范围</span>
                    <el-tag size="small" :type="editNodeScopeHint.tagType">
                      {{ editNodeScopeHint.label }}
                    </el-tag>
                  </div>
                  <div class="mt-1">
                    {{ editNodeScopeHint.description }}
                  </div>
                </div>
                <div
                  v-if="editNode.type === 'next'"
                  class="mt-2 text-xs text-slate-500"
                >
                  分页 XPath 是基于当前页面查找，不是基于列表项查找；如果填写了 `.//`，保存时会自动规范成 `//`。
                </div>
              </div>
            </el-form-item>

            <el-form-item
              v-if="editNode.type === 'next'"
              label="最大页数"
              :rules="[{ required: true, message: '必须填写最大页数' }]"
              class="!mb-0"
            >
              <el-input-number
                v-model="editNode.maxPages"
                :min="1"
                :max="50"
                placeholder="10"
                class="w-full"
              />
            </el-form-item>

            <el-form-item
              v-if="editNode.type === 'scroll'"
              label="最大滚动次数"
              :rules="[{ required: true, message: '必须填写最大滚动次数' }]"
              class="!mb-0"
            >
              <el-input-number
                v-model="editNode.maxScroll"
                :min="1"
                :max="100"
                placeholder="5"
                class="w-full"
              />
            </el-form-item>

            <el-form-item
              v-if="editNode.type === 'scroll'"
              label="等待时间(ms)"
              :rules="[{ required: true, message: '必须填写等待时间' }]"
              class="!mb-0"
            >
              <el-input-number
                v-model="editNode.waitTime"
                :min="500"
                :max="5000"
                :step="100"
                placeholder="1000"
                class="w-full"
              />
            </el-form-item>

            <el-form-item
              v-if="editNode.type === 'scroll'"
              label="最大数量限制"
              :rules="[{ required: true, message: '必须填写最大数量限制' }]"
              class="!mb-0"
            >
              <el-input-number
                v-model="editNode.maxItems"
                :min="1"
                :max="1000"
                :step="10"
                placeholder="100"
                class="w-full"
              />
            </el-form-item>
          </div>
          <div
            v-if="editNode.type === 'link'"
            class="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            该链接进入后的页面层配置已移到“页面层配置”弹窗中，这里只保留当前字段本身的设置。
          </div>
        </div>

        <div
          v-if="editNode.type === 'field'"
          class="rounded-lg border border-slate-200 bg-white p-4"
        >
          <div class="text-sm font-medium text-slate-900 mb-3">内容输出</div>
          <el-form-item label="内容格式" class="!mb-0">
            <el-radio-group v-model="editNode.contentFormat" class="flex flex-col items-start gap-2">
              <el-radio value="text">解析 HTML 标签为纯文本</el-radio>
              <el-radio value="html">保留 HTML 格式</el-radio>
              <el-radio value="markdown">转换为 Markdown</el-radio>
              <el-radio value="smart">智能提取（推荐文章内容）</el-radio>
            </el-radio-group>
            <div class="text-xs text-gray-500 mt-2">
              <div v-if="editNode.contentFormat === 'text'">
                将 HTML 标签解析为纯文本，适合提取简单文本内容。
              </div>
              <div v-else-if="editNode.contentFormat === 'html'">
                保留原始 HTML，适合保存文章内容或需要保留样式结构的文本。
              </div>
              <div v-else-if="editNode.contentFormat === 'markdown'">
                将 HTML 转成 Markdown，适合博客、文章、说明文档等内容。
              </div>
              <div v-else-if="editNode.contentFormat === 'smart'">
                <el-icon class="text-blue-500 mr-1"><InfoFilled /></el-icon>
                智能识别正文结构并优先输出更适合阅读的结果，适合新闻、文章、长文本页面。
              </div>
            </div>
          </el-form-item>
        </div>

        <div
          v-if="['field', 'image', 'link'].includes(editNode.type)"
          class="rounded-lg border border-slate-200 bg-white p-4"
        >
          <div class="text-sm font-medium text-slate-900 mb-3">高级处理</div>
          <el-form-item label="自定义处理 JS" class="!mb-0">
            <el-alert
              v-if="!unsafeCustomJsEnabled"
              type="warning"
              :closable="false"
              title="当前服务器已禁用自定义 JS"
              description="为避免后端执行用户脚本带来的风险，这类字段转换 JS 默认不可用。若当前节点已有脚本，可清空后继续保存。"
              class="mb-3"
            />
            <el-input
              v-model="editNode.customTransformCode"
              type="textarea"
              :rows="4"
              placeholder="return value ? value.trim() : null;"
              class="font-mono text-xs"
              :disabled="!unsafeCustomJsEnabled"
            />
            <div class="text-xs text-gray-500 mt-2">
              可选。入参为 `value`，请返回处理后的新值；返回 `null` 或 `undefined` 会将该字段置空。
            </div>
            <div
              v-if="!unsafeCustomJsEnabled && editNode.customTransformCode"
              class="mt-2 flex justify-end"
            >
              <el-button
                size="small"
                text
                type="danger"
                @click="editNode.customTransformCode = ''"
              >
                清空自定义 JS
              </el-button>
            </div>
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="layerConfigDialogVisible"
      title="页面层配置"
      width="780px"
      :close-on-click-modal="false"
      @closed="closeLayerConfig"
    >
      <div v-if="activeLayerNode" class="grid gap-4">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="text-sm font-medium text-slate-900">当前层级</div>
          <div class="mt-2 text-sm text-slate-700">
            链接节点：{{ activeLayerNode.label }}
          </div>
          <div class="mt-1 text-xs text-slate-500">
            这一层的字段、分页、滚动，以及这里配置的输入框和按钮动作，都会基于当前链接进入后的页面结构执行。
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-slate-900">当前层列表容器</div>
              <div class="mt-1 text-xs text-slate-500">
                这里不再单独手填。若这一层本身有多条记录，请通过“智能添加子节点”自动识别或手动确认。
              </div>
            </div>
            <el-button size="small" type="primary" plain @click="openSmartAddChildFromLayerConfig">
              智能添加子节点
            </el-button>
          </div>

          <el-alert
            v-if="trimValue(activeLayerNode.detailBaseSelector)"
            class="mt-3"
            type="success"
            :closable="false"
            title="当前层列表容器已配置"
            :description="`已在智能添加子节点中识别该层列表容器：${trimValue(activeLayerNode.detailBaseSelector)}`"
          />
          <el-alert
            v-else
            class="mt-3"
            type="info"
            :closable="false"
            title="当前层列表容器尚未识别"
            description="如果这一层只有单个详情页内容，可以不配置；如果这一层还有多条记录、分页或继续下钻，请先使用智能添加子节点完成这一层级配置。"
          />
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-slate-900">该页面层抓取前动作</div>
              <div class="mt-1 text-xs text-slate-500">
                可选，可添加多个，并按顺序执行。这里填写的是当前层页面里的输入框、按钮或等待目标的 XPath/CSS，不是列表项内部的相对 XPath。支持先输入再点击搜索，动作结束后系统会等待页面稳定再抓取；若填写 `.//`，保存时会自动规范成 `//`。右侧数字表示最大等待上限，可留空。
              </div>
            </div>
            <el-button size="small" type="primary" @click="addActiveLayerPreAction">添加动作</el-button>
          </div>

          <div v-if="layerConfigForm.preActions.length === 0" class="mt-3 text-xs text-gray-500">
            未配置
          </div>
          <div
            v-for="(action, index) in layerConfigForm.preActions"
            :key="`layer-action-${activeLayerNode.id}-${index}`"
            class="mt-3 grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <el-select v-model="action.type" class="col-span-3" @change="onActionTypeChange(action)">
              <el-option label="点击" value="click" />
              <el-option label="输入文本" value="type" />
              <el-option label="等待元素" value="wait_for_selector" />
              <el-option label="等待时间" value="wait_for_timeout" />
            </el-select>
            <el-select
              v-if="action.type !== 'wait_for_timeout'"
              v-model="action.selectorType"
              class="col-span-2"
            >
              <el-option label="XPath" value="xpath" />
              <el-option label="CSS" value="css" />
            </el-select>
            <el-input
              v-if="action.type !== 'wait_for_timeout'"
              v-model="action.selector"
              :class="action.type === 'type' ? 'col-span-3' : 'col-span-5'"
              placeholder="//button[contains(.,'搜索')] 或 .btn-search"
            />
            <el-input
              v-if="action.type === 'type'"
              v-model="action.value"
              class="col-span-2"
              placeholder="输入内容"
            />
            <div class="col-span-2">
              <div class="mb-1 text-[11px] leading-4 text-gray-500">
                {{ action.type === "wait_for_timeout" ? "固定等待时长(ms)" : "最大等待上限(ms)" }}
              </div>
              <el-input-number
                v-model="action.timeout"
                class="w-full"
                :min="100"
                :max="120000"
                :step="100"
                :placeholder="action.type === 'wait_for_timeout' ? '等待时长' : '留空自动'"
              />
            </div>
            <el-button
              class="col-span-12 justify-self-end"
              size="small"
              type="danger"
              text
              @click="removeActiveLayerPreAction(index)"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <el-button @click="closeLayerConfig">取消</el-button>
          <el-button type="primary" @click="saveLayerConfig">保存页面层配置</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 添加子节点弹框 -->
    <AddChildNodeDialog
      v-model:visible="addChildDialogVisible"
      :parent-node="addChildParent"
      :page-url="getPageUrl(addChildParent)"
      @confirm="handleChildNodeConfirm"
    />
    <div class="mt-4 flex justify-end gap-2">
      <el-button @click="goPrev">上一步</el-button>
      <el-button type="primary" @click="goNext">下一步</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  buildTaskCookiePayload,
  normalizePreActionSelector,
  useTaskFormStore,
} from "@/stores/taskForm";
import type { PreActionConfig } from "@/stores/taskForm";
import { xpathParseApi, xpathValidateApi } from "@/api/task";
import { usePlatformInfo } from "@/composables/usePlatformInfo";

import { ElMessageBox, ElMessage } from "element-plus";
import { Loading, InfoFilled } from "@element-plus/icons-vue";
import FieldNodeList from "./components/FieldNodeList.vue";
import AddChildNodeDialog from "./components/AddChildNodeDialog.vue";
interface TreeNode {
  id: number;
  label: string;
  type: "field" | "image" | "link" | "next" | "scroll";
  selector?: string;
  jsPath?: string;
  samples?: string[];
  children?: TreeNode[];
  hasChildren?: boolean;
  imgSrc?: string;
  maxPages?: number;
  maxScroll?: number;
  waitTime?: number;
  maxItems?: number;
  listBaseSelector?: string;
  listOutputKey?: string;
  preActions?: PreActionConfig[];
  detailBaseSelector?: string;
  customTransformCode?: string;
  contentFormat?: "text" | "html" | "markdown" | "smart"; // 内容格式，默认为text
  exampleMatchCount?: number | null;
}

declare global {
  interface TreeNode {
    id: number;
    label: string;
    type: "field" | "image" | "link" | "next" | "scroll";
    selector?: string;
    jsPath?: string;
    samples?: string[];
    children?: TreeNode[];
    hasChildren?: boolean;
    imgSrc?: string;
    maxPages?: number;
    maxScroll?: number;
    waitTime?: number;
    maxItems?: number;
    listBaseSelector?: string;
    listOutputKey?: string;
    preActions?: PreActionConfig[];
    detailBaseSelector?: string;
    customTransformCode?: string;
    contentFormat?: "text" | "html" | "markdown" | "smart"; // 内容格式，默认为text
    exampleMatchCount?: number | null;
  }
}

const store = useTaskFormStore();
let idSeed = 1;
const rootNodes = computed(() => store.treeData as any);
const router = useRouter();
const { platformInfo, fetchPlatformInfo } = usePlatformInfo();
const unsafeCustomJsEnabled = computed(
  () => platformInfo.value?.capabilities?.unsafeCustomJsEnabled !== false,
);

function isEditableExtractType(type?: TreeNode["type"]) {
  return type === "field" || type === "image" || type === "link";
}

function trimValue(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizePageScopedSelector(value?: string | null) {
  const normalized = trimValue(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith(".//")) {
    return `//${normalized.slice(3)}`;
  }

  return normalized;
}

function normalizeXPathExpression(value?: string | null) {
  const normalized = trimValue(value);
  if (!normalized) {
    return undefined;
  }

  return normalized.startsWith("xpath=")
    ? normalized.slice("xpath=".length).trim()
    : normalized;
}

function getXPathScopeHint(selector?: string | null) {
  const expression = normalizeXPathExpression(selector);
  if (!expression) {
    return null;
  }

  if (expression.startsWith("./") || expression.startsWith(".//")) {
    return {
      label: "当前列表项",
      tagType: "success" as const,
      description:
        "以 `./` 或 `.//` 开头时，会基于当前列表项或当前层容器匹配，适合提取这一项自己的标题、图片、详情链接等字段。",
    };
  }

  return {
    label: "当前页面",
    tagType: "info" as const,
    description:
      "以 `//`、`/` 等开头时，会基于当前页面根节点匹配，不会自动限制在当前列表项内。只有你明确需要取整页公共信息时再这样写。",
  };
}

function visitTreeNodes(
  nodes: TreeNode[],
  visitor: (node: TreeNode) => void,
  excludedRootId?: number,
) {
  for (const node of nodes) {
    if (node.id === excludedRootId) {
      continue;
    }

    visitor(node);
    if (node.children?.length) {
      visitTreeNodes(node.children, visitor, excludedRootId);
    }
  }
}

function collectUsedFieldNames(excludeId?: number, excludedRootId?: number) {
  const used = new Set<string>();
  visitTreeNodes(
    store.treeData as TreeNode[],
    (node) => {
      if (!isEditableExtractType(node.type) || node.id === excludeId) {
        return;
      }

      const label = trimValue(node.label);
      if (label) {
        used.add(label);
      }
    },
    excludedRootId,
  );
  return used;
}

function createUniqueFieldLabel(baseLabel: string, excludeId?: number) {
  const normalizedBase = trimValue(baseLabel) || "新属性";
  const used = collectUsedFieldNames(excludeId);

  if (!used.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (used.has(`${normalizedBase}_${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase}_${suffix}`;
}

function findDuplicateFieldNames(nodes: TreeNode[]) {
  const counts = new Map<string, number>();
  visitTreeNodes(nodes, (node) => {
    if (!isEditableExtractType(node.type)) {
      return;
    }

    const label = trimValue(node.label);
    if (!label) {
      return;
    }

    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([label]) => label);
}

function clonePreActions(actions?: PreActionConfig[]) {
  return (actions || []).map((action) => ({ ...action }));
}

function normalizeEditablePreActions(actions?: PreActionConfig[]) {
  return clonePreActions(actions).map((action) => ({
    ...action,
    selector:
      action.type === "wait_for_timeout"
        ? undefined
        : normalizePreActionSelector(action.selector, action.selectorType),
    value: action.type === "type" ? String(action.value ?? "") : "",
  }));
}
// 检测XPath或文本内容类型，返回推荐的XPath类型
function detectContentType(input: string): string | null {
  if (!input) return null;

  // XPath检测模式 - 不同类型的内容模式
  const typePatterns = {
    article: [
      /article/i,
      /post/i,
      /content/i,
      /entry/i,
      /blog/i,
      /news/i,
      /story/i,
      /\bmain\b/i,
      /\bsection\b/i,
      /\bdiv\b.*\bcontent\b/i,
      /\bdiv\b.*\barticle\b/i,
      /\bdiv\b.*\bpost\b/i,
      /\bdiv\b.*\bentry\b/i,
      /\bdiv\b.*\btext\b/i,
      /\bp\b.*\bcontent\b/i,
      /class.*content/i,
      /class.*article/i,
      /class.*post/i,
      /class.*text/i,
      /id.*content/i,
      /id.*article/i,
      /id.*post/i,
      // 更精确的模式
      /\/\/article/i,
      /\/\/div\[.*content.*\]/i,
      /\/\/section/i,
      /\/\/main/i
    ],
    title: [
      /title/i,
      /h1/i,
      /h2/i,
      /headline/i,
      /heading/i,
      /class.*title/i,
      /id.*title/i,
      /\/\/h1/i,
      /\/\/h2/i
    ],
    summary: [
      /summary/i,
      /description/i,
      /excerpt/i,
      /abstract/i,
      /preview/i,
      /class.*summary/i,
      /class.*desc/i,
      /meta.*description/i
    ],
    author: [
      /author/i,
      /writer/i,
      /byline/i,
      /class.*author/i,
      /id.*author/i
    ],
    date: [
      /date/i,
      /time/i,
      /published/i,
      /datetime/i,
      /class.*date/i,
      /class.*time/i
    ],
    category: [
      /category/i,
      /tag/i,
      /topic/i,
      /class.*cat/i,
      /class.*tag/i
    ]
  };

  // 检查是否匹配不同类型的XPath模式
  for (const [type, patterns] of Object.entries(typePatterns)) {
    if (patterns.some(pattern => pattern.test(input))) {
      return type;
    }
  }

  // 如果输入看起来像是实际的文本内容（不是XPath），进行内容分析
  const looksLikeContent = !input.includes('/') && !input.includes('[') && !input.includes('@') && input.length > 50;

  if (looksLikeContent) {
    // 内容分析模式
    const contentIndicators = [
      // 文本长度（文章通常较长）
      input.length > 200,
      // 包含多个句子
      (input.match(/[.!?。！？]/g) || []).length > 3,
      // 包含段落分隔
      input.includes('\n\n') || input.includes('\r\n\r\n'),
      // 包含HTML段落标签（如果保留了HTML）
      input.includes('<p>') || input.includes('</p>'),
      // 不像是列表项（不包含序号或短语）
      !/^\d+\.|\*\s|-\s/.test(input.trim()),
      // 包含文章常见词汇
      /\b(the|a|an)\s+(article|post|blog|news|story|content)\b/i.test(input)
    ];

    // 如果满足多个内容指标，认为是文章内容
    const contentScore = contentIndicators.filter(Boolean).length;
    if (contentScore >= 2) {
      return 'article';
    }

    // 检查是否是标题（较短，可能是标题）
    if (input.length < 200 && input.length > 10) {
      const titleIndicators = [
        !input.includes('\n'), // 单行
        /^[A-Z]/.test(input.trim()), // 大写开头
        (input.match(/[.!?。！？]/g) || []).length <= 1, // 至多一个句子结束符
        !/\d{4}-\d{2}-\d{2}/.test(input), // 不包含日期格式
      ];
      if (titleIndicators.filter(Boolean).length >= 2) {
        return 'title';
      }
    }

    // 检查是否是摘要（中等长度）
    if (input.length >= 50 && input.length <= 500) {
      return 'summary';
    }
  }

  return null; // 未识别出特定类型
}

// 保持向后兼容的函数
function isArticleLike(input: string): boolean {
  const detectedType = detectContentType(input);
  return detectedType === 'article';
}

// 编辑弹框
const editDialogVisible = ref(false);
const editNode = ref<TreeNode>({} as TreeNode);
const editForm = ref();
const editNodeScopeHint = computed(() =>
  getXPathScopeHint(editNode.value?.selector),
);
const layerConfigDialogVisible = ref(false);
const layerConfigForm = ref<{ preActions: PreActionConfig[] }>({
  preActions: [],
});

// 批量删除
const batchMode = ref(false);
const selectedNodes = ref<TreeNode[]>([]);
const activeLayerNodeId = ref<number | null>(null);

// 新节点类型
const newNodeType = ref<"field" | "image" | "link" | "next" | "scroll">("field");

// 添加子节点弹框相关
const addChildDialogVisible = ref(false);
const addChildParent = ref<any>(null);
const tableLoading = ref(true);

function createPreAction(): PreActionConfig {
  return {
    type: "click",
    selectorType: "xpath",
    selector: "",
    value: "",
    timeout: undefined,
  };
}

function onActionTypeChange(action: PreActionConfig) {
  if (action.type === "wait_for_timeout") {
    action.selectorType = undefined;
    action.selector = "";
    action.value = "";
    action.timeout = action.timeout || 1000;
    return;
  }
  action.selectorType = action.selectorType || "xpath";
  if (action.type === "type") {
    action.value = String(action.value ?? "");
  } else {
    action.value = "";
  }
}

function addGlobalPreAction() {
  store.crawlerConfig.preActions.push(createPreAction());
}

function removeGlobalPreAction(index: number) {
  store.crawlerConfig.preActions.splice(index, 1);
}

function findNodeInTree(list: TreeNode[], id: number): TreeNode | null {
  for (const node of list) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const found = findNodeInTree(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findNodeSiblings(list: TreeNode[], id: number): TreeNode[] | null {
  for (const node of list) {
    if (node.id === id) {
      return list;
    }
    if (node.children?.length) {
      const found = findNodeSiblings(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

const activeLayerNode = computed(() => {
  if (!activeLayerNodeId.value) {
    return null;
  }
  return findNodeInTree(store.treeData as TreeNode[], activeLayerNodeId.value);
});

function openLayerConfig(node: TreeNode) {
  activeLayerNodeId.value = node.id;
  layerConfigForm.value = {
    preActions: normalizeEditablePreActions(node.preActions),
  };
  layerConfigDialogVisible.value = true;
}

function closeLayerConfig() {
  layerConfigDialogVisible.value = false;
  activeLayerNodeId.value = null;
  layerConfigForm.value = {
    preActions: [],
  };
}

function ensureActiveLayerPreActions() {
  if (!Array.isArray(layerConfigForm.value.preActions)) {
    layerConfigForm.value.preActions = [];
  }
  return layerConfigForm.value.preActions;
}

function addActiveLayerPreAction() {
  ensureActiveLayerPreActions().push(createPreAction());
}

function removeActiveLayerPreAction(index: number) {
  ensureActiveLayerPreActions().splice(index, 1);
}

function openSmartAddChildFromLayerConfig() {
  if (!activeLayerNode.value) {
    return;
  }
  layerConfigDialogVisible.value = false;
  openAddChildDialog(activeLayerNode.value);
}

function saveLayerConfig() {
  if (!activeLayerNode.value) {
    closeLayerConfig();
    return;
  }

  if (!validatePreActions(layerConfigForm.value.preActions)) {
    ElMessage.error("页面层前置动作配置不完整");
    return;
  }

  activeLayerNode.value.preActions = normalizeEditablePreActions(
    layerConfigForm.value.preActions,
  );
  layerConfigDialogVisible.value = false;
  ElMessage.success("页面层配置已保存");
}

function validatePreActions(actions: PreActionConfig[]): boolean {
  for (const action of actions) {
    if (action.type === "wait_for_timeout") {
      if (!action.timeout || action.timeout < 100) return false;
      continue;
    }
    if (!normalizePreActionSelector(action.selector, action.selectorType)) return false;
    if (action.type === "type" && !String(action.value ?? "").trim()) return false;
    if (action.timeout !== undefined && action.timeout !== null && Number(action.timeout) < 100) {
      return false;
    }
  }
  return true;
}




// 点击"添加子节点"时调用
function openAddChildDialog(node: any) {
  addChildParent.value = node;
  addChildDialogVisible.value = true;
}

// 获取页面URL
function getPageUrl(node: any): string {
  if (!node) return store.form.url;

  // 如果节点有samples，使用第一个有效的URL
  if (node.samples && node.samples.length > 0) {
    const sampleUrl = node.samples[0];
    if (sampleUrl && (sampleUrl.startsWith('http://') || sampleUrl.startsWith('https://'))) {
      return sampleUrl;
    }
  }

  // 否则使用默认的表单URL
  return store.form.url;
}

function findNodePath(
  list: TreeNode[],
  id: number,
  path: TreeNode[] = [],
): TreeNode[] | null {
  for (const node of list) {
    const nextPath = [...path, node];
    if (node.id === id) {
      return nextPath;
    }

    if (node.children?.length) {
      const found = findNodePath(node.children, id, nextPath);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function resolveNodeValidationContext(nodeId: number) {
  const nodePath = findNodePath(store.treeData as TreeNode[], nodeId) || [];
  const rootBaseXpath = trimValue(
    String(store.selectedItem?.xpath || store.selectedItem?.jsPath || ""),
  );

  for (let i = nodePath.length - 2; i >= 0; i -= 1) {
    const currentNode = nodePath[i];
    if (!currentNode) {
      continue;
    }
    if (currentNode.type === "link") {
      return {
        url: trimValue(getPageUrl(currentNode)),
        baseXpath: trimValue(currentNode.detailBaseSelector),
        scopeLabel: trimValue(currentNode.label) || "当前链接层",
      };
    }
  }

  return {
    url: trimValue(store.form.url),
    baseXpath: rootBaseXpath,
    scopeLabel: "当前列表层",
  };
}

async function fetchNodeExampleMatchCount(
  nodeId: number,
  nodeType: TreeNode["type"],
  selector?: string,
) {
  const normalizedSelector = trimValue(selector);
  if (!normalizedSelector || !isEditableExtractType(nodeType)) {
    return null;
  }

  const context = resolveNodeValidationContext(nodeId);
  if (!context.url) {
    return null;
  }

  const cookiePayload = buildTaskCookiePayload(store.crawlerConfig);
  const validation = await xpathValidateApi({
    url: context.url,
    xpath: normalizedSelector,
    baseXpath: context.baseXpath,
    sampleMode: context.baseXpath ? "example" : undefined,
    ...cookiePayload,
  });

  if (validation.scope === "list") {
    return validation.items?.[0]?.matchCount ?? null;
  }

  return validation.count ?? null;
}

async function annotateNodeExampleMatchCount(nodeId: number) {
  const target = findNodeInTree(store.treeData as TreeNode[], nodeId);
  if (!target) {
    return;
  }

  if (!isEditableExtractType(target.type)) {
    target.exampleMatchCount = null;
    return;
  }

  try {
    target.exampleMatchCount = await fetchNodeExampleMatchCount(
      nodeId,
      target.type,
      target.selector,
    );
  } catch {
    target.exampleMatchCount = null;
  }
}

async function annotateNodesExampleMatchCount(nodes: TreeNode[]) {
  const targets = nodes.filter((node) => isEditableExtractType(node.type));
  await Promise.all(
    targets.map((node) => annotateNodeExampleMatchCount(node.id)),
  );
}

async function validateNodeSelectorAtEditStage(
  nodeId: number,
  nodeType: TreeNode["type"],
  selector?: string,
) {
  const normalizedSelector = trimValue(selector);
  if (!normalizedSelector || nodeType === "scroll") {
    return true;
  }

  const context = resolveNodeValidationContext(nodeId);
  if (!context.url) {
    return true;
  }

  const cookiePayload = buildTaskCookiePayload(store.crawlerConfig);
  const validation = await xpathValidateApi({
    url: context.url,
    xpath: normalizedSelector,
    baseXpath:
      nodeType === "next" ? undefined : context.baseXpath,
    sampleMode:
      nodeType === "next" || !context.baseXpath ? undefined : "example",
    ...cookiePayload,
  });

  if (validation.scope === "list") {
    const sampledBaseCount = validation.sampledBaseCount ?? validation.baseCount ?? 0;
    const zeroMatchCount = validation.zeroMatchCount ?? 0;
    const multiMatchCount = validation.multiMatchCount ?? 0;
    const singleMatchCount = Math.max(
      0,
      sampledBaseCount - zeroMatchCount - multiMatchCount,
    );

    if (validation.status === "empty_base") {
      ElMessage.error(`${context.scopeLabel} 还没有配置可校验的列表容器`);
      return false;
    }

    if (validation.status === "missing") {
      ElMessage.error(
        `${context.scopeLabel} 中没有命中这个 XPath，请先调整后再保存`,
      );
      return false;
    }

    if (
      validation.status === "ambiguous" ||
      multiMatchCount > 0
    ) {
      if ((validation.sampledBaseCount ?? 0) === 1) {
        ElMessage.error(
          `${context.scopeLabel} 的当前示例列表项里命中了 ${validation.items?.[0]?.matchCount ?? 0} 个元素，请把 XPath 收窄到只命中 1 个`,
        );
      } else {
        ElMessage.error(
          `${context.scopeLabel} 中存在歧义：采样 ${sampledBaseCount} 项里，单命中 ${singleMatchCount}，未命中 ${zeroMatchCount}，多命中 ${multiMatchCount}`,
        );
      }
      return false;
    }

    if (validation.status === "partial" || zeroMatchCount > 0) {
      ElMessage.warning(
        `${context.scopeLabel} 中采样 ${sampledBaseCount} 项，仍有 ${zeroMatchCount} 项未命中，请确认这是否符合预期`,
      );
    }

    return true;
  }

  const count = validation.count ?? 0;
  if (count <= 0) {
    ElMessage.error("当前页面没有命中这个 XPath，请先调整后再保存");
    return false;
  }

  if (validation.status === "ambiguous" || count > 1) {
    ElMessage.warning(`当前页面命中了 ${count} 个元素，请确认这是否符合预期`);
  }

  return true;
}

// 处理子节点确认添加
function handleChildNodeConfirm(payload: { children: any[]; detailBaseSelector?: string }) {
  if (!addChildParent.value) return;

  const usedFieldNames = collectUsedFieldNames(undefined, addChildParent.value.id);
  const normalizedChildren = (payload.children || []).map((child: TreeNode) => {
    if (!isEditableExtractType(child.type)) {
      return child;
    }

    const baseLabel = trimValue(child.label) || "新属性";
    let nextLabel = baseLabel;
    let suffix = 2;
    while (usedFieldNames.has(nextLabel)) {
      nextLabel = `${baseLabel}_${suffix}`;
      suffix += 1;
    }
    usedFieldNames.add(nextLabel);

    return {
      ...child,
      label: nextLabel,
    };
  });

  // 使用Vue响应式方式更新children
  addChildParent.value.children.splice(0, addChildParent.value.children.length, ...normalizedChildren);
  if (addChildParent.value.type === "link") {
    addChildParent.value.detailBaseSelector = payload.detailBaseSelector?.trim() || undefined;
    openLayerConfig(addChildParent.value);
  }
  addChildParent.value.hasChildren = true;
  void annotateNodesExampleMatchCount(normalizedChildren);
  addChildDialogVisible.value = false;
  addChildParent.value = null;
}

// 初始化树
async function initTree() {
  if (!store.form.url) {
    tableLoading.value = false;
    return;
  }
  const baseSelector = String(
    store.selectedItem?.xpath || store.selectedItem?.jsPath || "",
  ).trim();
  if (!baseSelector) {
    tableLoading.value = false;
    return;
  }

  try {
    const res: any = await xpathParseApi({
      url: store.form.url,
      xpath: baseSelector,
      ...buildTaskCookiePayload(store.crawlerConfig),
    });
    store.treeData.length = 0;
    const item = res.items;
    if (!item) return;

    // 文本 - 根据内容自动设置内容格式
    item.texts?.forEach(({ text, xpath }: any) => {
      let contentFormat: "text" | "html" | "markdown" | "smart" = "text";

      if (isArticleLike(text)) {
        // 如果内容可能是文章，使用智能提取
        contentFormat = "smart";
      }

      store.treeData.push(
        createNode("field", text, xpath, [text], false, contentFormat)
      );
    });

    // 图片
    item.images?.forEach(({ src, xpath }: any) => {
      const node = createNode(
        "image",
        src,
        xpath,
        [src],
        false,
      );
      // node.imgSrc = src // 图片直接显示 src
      store.treeData.push(node);
    });

    // 链接
    item.links?.forEach(({ href, xpath }: any) => {
      store.treeData.push(
        createNode("link", "链接地址", xpath, [href], true)
      );
    });

    await annotateNodesExampleMatchCount(store.treeData as TreeNode[]);
  } catch (e) {
    console.error("XPath解析失败", e);
  } finally {
    tableLoading.value = false;
  }
}

// 创建节点
function createNode(
  type: "field" | "image" | "link" | "next" | "scroll",
  label: string,
  selector: string,
  samples: string[] = [],
  hasChildren = false,
  contentFormat?: "text" | "html" | "markdown" | "smart"
): TreeNode {
  // 确定内容格式
  let finalContentFormat: "text" | "html" | "markdown" | "smart" = "text";
  const finalLabel = isEditableExtractType(type)
    ? createUniqueFieldLabel(label)
    : label;

  if (type === "field") {
    if (contentFormat !== undefined) {
      // 如果明确传入了内容格式，使用它
      finalContentFormat = contentFormat;
    } else {
      // 否则根据内容自动确定格式
      if (isArticleLike(label)) {
        finalContentFormat = "smart";
      }
    }
  }

  return {
    id: idSeed++,
    type,
    label: finalLabel,
    selector,
    samples,
    hasChildren,
    children: type === "link" ? [] : undefined,
    preActions: type === "link" ? [] : undefined,
    contentFormat: type === "field" ? finalContentFormat : undefined,
    exampleMatchCount: null,
  };
}

// 编辑
function openEditDialog(node: TreeNode) {
  editNode.value = {
    ...node,
    selector: node.selector ?? node.jsPath ?? "",
    contentFormat: node.contentFormat ?? "text", // 确保contentFormat有默认值
    customTransformCode: node.customTransformCode ?? "",
  };
  editDialogVisible.value = true;
}
function saveEdit() {
  // 表单验证
  const editFormRef = editForm.value as any;
  if (editFormRef) {
    editFormRef.validate(async (valid: boolean) => {
      if (!valid) {
        return false;
      }

      const target = findNodeInTree(store.treeData as TreeNode[], editNode.value.id);
      const siblings = findNodeSiblings(store.treeData as TreeNode[], editNode.value.id) || [];
      if (!target) {
        ElMessage.error('未找到要编辑的节点');
        return false;
      }

      if (
        !unsafeCustomJsEnabled.value &&
        String(editNode.value.customTransformCode ?? "").trim()
      ) {
        ElMessage.error("当前服务器已禁用字段自定义 JS，请先清空后再保存");
        return false;
      }

      const nextType = editNode.value.type;
      const normalizedSelector =
        nextType === "next"
          ? normalizePageScopedSelector(editNode.value.selector)
          : trimValue(editNode.value.selector);
      if (nextType !== "scroll" && !normalizedSelector) {
        ElMessage.error("请填写 XPath");
        return false;
      }

      const originalNormalizedSelector =
        nextType === "next"
          ? normalizePageScopedSelector(target.selector)
          : trimValue(target.selector);

      if (
        normalizedSelector &&
        normalizedSelector !== originalNormalizedSelector &&
        (isEditableExtractType(nextType) || nextType === "next")
      ) {
        const selectorValid = await validateNodeSelectorAtEditStage(
          editNode.value.id,
          nextType,
          normalizedSelector,
        );
        if (!selectorValid) {
          return false;
        }
      }

      const normalizedLabel = trimValue(editNode.value.label) || "新属性";
      if (
        isEditableExtractType(editNode.value.type) &&
        collectUsedFieldNames(editNode.value.id).has(normalizedLabel)
      ) {
        ElMessage.error(`字段名“${normalizedLabel}”已存在，请保持唯一`);
        return false;
      }

      if (
        target.type === "link" &&
        nextType !== "link" &&
        target.children?.length
      ) {
        ElMessage.error("该链接节点下仍有子节点，请先移除子节点后再改为非链接类型");
        return false;
      }

      if (editNode.value.type === 'next') {
        if (!editNode.value.maxPages || editNode.value.maxPages < 1 || editNode.value.maxPages > 50) {
          ElMessage.error('最大页数必须在1-50之间');
          return false;
        }
      }

      if (editNode.value.type === 'scroll') {
        if (!editNode.value.maxScroll || editNode.value.maxScroll < 1 || editNode.value.maxScroll > 100) {
          ElMessage.error('最大滚动次数必须在1-100之间');
          return false;
        }
        if (!editNode.value.waitTime || editNode.value.waitTime < 500 || editNode.value.waitTime > 5000) {
          ElMessage.error('等待时间必须在500-5000ms之间');
          return false;
        }
        if (!editNode.value.maxItems || editNode.value.maxItems < 1 || editNode.value.maxItems > 1000) {
          ElMessage.error('最大数量限制必须在1-1000之间');
          return false;
        }
      }

      if (
        (editNode.value.type === "next" || editNode.value.type === "scroll") &&
        siblings.some((node) => node.id !== editNode.value.id && node.type === editNode.value.type)
      ) {
        ElMessage.error(`同一层只能存在一个${editNode.value.type === "next" ? "分页" : "滚动"}节点`);
        return false;
      }

      if (
        target.type === "link" &&
        target.preActions?.length &&
        !validatePreActions(target.preActions)
      ) {
        openLayerConfig(target);
        ElMessage.error("该页面层前置动作配置不完整，请先在页面层配置弹窗中修正");
        return false;
      }

      if (
        target.type === "link" &&
        target.children?.some((child) => child.type === "link" || child.type === "next" || child.type === "scroll") &&
        !trimValue(target.detailBaseSelector)
      ) {
        openLayerConfig(target);
        ElMessage.error("存在下一级页面结构时，请先通过“智能添加子节点”完成这一层页面配置");
          return false;
      }

      const normalizedNode: TreeNode = {
        ...editNode.value,
        jsPath: undefined,
        selector: normalizedSelector,
        label: normalizedLabel,
        listBaseSelector: undefined,
        listOutputKey: undefined,
        detailBaseSelector:
          editNode.value.type === "link"
            ? trimValue(target.detailBaseSelector)
            : undefined,
        customTransformCode: trimValue(editNode.value.customTransformCode),
        contentFormat:
          editNode.value.type === "field"
            ? editNode.value.contentFormat ?? "text"
            : undefined,
        preActions:
          editNode.value.type === "link"
            ? clonePreActions(target.preActions)
            : undefined,
        children:
          editNode.value.type === "link"
            ? Array.isArray(target.children)
              ? target.children
              : []
            : undefined,
        hasChildren: editNode.value.type === "link",
        maxPages: editNode.value.type === "next" ? editNode.value.maxPages : undefined,
        maxScroll:
          editNode.value.type === "scroll" ? editNode.value.maxScroll : undefined,
        waitTime: editNode.value.type === "scroll" ? editNode.value.waitTime : undefined,
        maxItems: editNode.value.type === "scroll" ? editNode.value.maxItems : undefined,
      };

      Object.assign(target, normalizedNode);
      if (isEditableExtractType(target.type)) {
        void annotateNodeExampleMatchCount(target.id);
      }
      editDialogVisible.value = false;
      ElMessage.success('保存成功');
    });
  }
}

// 删除
function removeNode(id: number) {
  function dfs(list: TreeNode[]): boolean {
    const idx = list.findIndex((n) => n.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    return list.some((n) => n.children && dfs(n.children));
  }
  dfs(store.treeData as any);
  if (activeLayerNodeId.value === id) {
    closeLayerConfig();
  }
}

// 批量删除
function enableBatchMode() {
  batchMode.value = true;
  selectedNodes.value = [];
}

function disableBatchMode() {
  batchMode.value = false;
  selectedNodes.value = [];
}

function handleSelectionChange(nodes: TreeNode[]) {
  selectedNodes.value = nodes;
}

function confirmBatchDelete() {
  if (selectedNodes.value.length === 0) {
    ElMessage.warning('请先选择要删除的节点');
    return;
  }

  ElMessageBox.confirm(
    `确定要删除选中的 ${selectedNodes.value.length} 个节点吗？此操作不可恢复。`,
    '批量删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(() => {
      // 执行批量删除
      const idsToDelete = selectedNodes.value.map(node => node.id);
      idsToDelete.forEach(id => removeNode(id));

      disableBatchMode();
      ElMessage.success(`成功删除 ${idsToDelete.length} 个节点`);
    })
    .catch(() => {
      // 用户取消操作
    });
}

// 添加最外层新节点
function addNewNode() {
  if (
    (newNodeType.value === "next" || newNodeType.value === "scroll") &&
    store.treeData.some((node) => node.type === newNodeType.value)
  ) {
    ElMessage.warning(`同一层只能添加一个${newNodeType.value === "next" ? "分页" : "滚动"}节点`);
    return;
  }

  let label = "新属性";
  let selector = ".//text()";
  let maxPages: number | undefined;
  let maxScroll: number | undefined;
  let waitTime: number | undefined;
  let maxItems: number | undefined;
  let hasChildren = false;

  if (newNodeType.value === "next") {
    label = "分页";
    selector = "//a[@class='next']";
    maxPages = 10;
  } else if (newNodeType.value === "scroll") {
    label = "滚动";
    selector = "";
    maxScroll = 5;
    waitTime = 1000;
    maxItems = 100;
  } else if (newNodeType.value === "link") {
    label = "链接地址";
    selector = ".//a[1]"; // 默认链接选择器
    hasChildren = true; // 链接默认可以有子节点
  }

  const node = createNode(newNodeType.value, label, selector, [""], hasChildren);
  // 设置默认值
  if (maxPages !== undefined) node.maxPages = maxPages;
  if (maxScroll !== undefined) node.maxScroll = maxScroll;
  if (waitTime !== undefined) node.waitTime = waitTime;
  if (maxItems !== undefined) node.maxItems = maxItems;

  // 对于field类型的节点，使用默认内容格式
  if (newNodeType.value === "field") {
    node.contentFormat = "text";
  }

  store.treeData.push(node);
  void annotateNodeExampleMatchCount(node.id);
  if (newNodeType.value === "link") {
    openLayerConfig(node);
  }
}

function addCustomChildNode(
  parentNode: TreeNode,
  type: "field" | "image" | "link" | "next" | "scroll",
) {
  parentNode.children ||= [];

  if (
    (type === "next" || type === "scroll") &&
    parentNode.children.some((child) => child.type === type)
  ) {
    ElMessage.warning(`同一层只能添加一个${type === "next" ? "分页" : "滚动"}节点`);
    return;
  }

  let label = "新属性";
  let selector = ".//text()";
  let hasChildren = false;

  if (type === "next") {
    label = "分页";
    selector = "//a[@class='next']";
  } else if (type === "scroll") {
    label = "滚动";
    selector = "";
  } else if (type === "link") {
    label = "链接地址";
    selector = ".//a[1]";
    hasChildren = true;
  }

  const node = createNode(type, label, selector, [""], hasChildren);
  if (type === "next") {
    node.maxPages = 10;
  }
  if (type === "scroll") {
    node.maxScroll = 5;
    node.waitTime = 1000;
    node.maxItems = 100;
  }
  if (type === "field") {
    node.contentFormat = "text";
  }

  parentNode.children.push(node);
  parentNode.hasChildren = true;
  void annotateNodeExampleMatchCount(node.id);
  if (type === "link") {
    openLayerConfig(node);
  }
}

function goPrev() {
  router.push("/crawleer/task-add/structure");
}
function goNext() {
  if (!validatePreActions(store.crawlerConfig.preActions || [])) {
    ElMessage.error("根层前置动作配置不完整");
    return;
  }

  const findInvalidLayerActionNode = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (n.type === "link" && n.preActions?.length && !validatePreActions(n.preActions)) {
        return n;
      }
      if (n.children?.length) {
        const bad = findInvalidLayerActionNode(n.children);
        if (bad) return bad;
      }
    }
    return null;
  };
  const invalidLayerActionNode = findInvalidLayerActionNode(store.treeData as TreeNode[]);
  if (invalidLayerActionNode) {
    openLayerConfig(invalidLayerActionNode);
    ElMessage.error("存在页面层前置动作配置不完整，请先修正对应链接节点");
    return;
  }

  const findMissingLayerBaseSelector = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (
        n.type === "link" &&
        n.children?.some((child) => child.type === "link" || child.type === "next" || child.type === "scroll") &&
        !trimValue(n.detailBaseSelector)
      ) {
        return n;
      }
      if (n.children?.length) {
        const bad = findMissingLayerBaseSelector(n.children);
        if (bad) return bad;
      }
    }
    return null;
  };

  const missingLayerBaseSelectorNode = findMissingLayerBaseSelector(store.treeData as TreeNode[]);
  if (missingLayerBaseSelectorNode) {
    openLayerConfig(missingLayerBaseSelectorNode);
    ElMessage.error("存在多级页面结构但未完成页面层配置，请先使用“智能添加子节点”识别当前层列表容器");
    return;
  }

  // 检查所有滚动节点是否配置了maxItems（含嵌套）
  const findScrollNodes = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      if (n.type === "scroll") out.push(n);
      if (n.children?.length) out.push(...findScrollNodes(n.children));
    }
    return out;
  };
  const badScrollNode = findScrollNodes(store.treeData as TreeNode[]).find(
    (n) => !n.maxItems || n.maxItems < 1,
  );
  if (badScrollNode) {
    ElMessage.error("滚动节点必须配置最大数量限制");
    return;
  }

  const duplicateFieldNames = findDuplicateFieldNames(store.treeData as TreeNode[]);
  if (duplicateFieldNames.length > 0) {
    ElMessage.error(
      `字段名不能重复：${duplicateFieldNames.slice(0, 3).join("、")}`,
    );
    return;
  }

  router.push("/crawleer/task-add/config");
}

onMounted(() => {
  void fetchPlatformInfo();
  initTree();
});
</script>

<style scoped>
.el-table img {
  display: block;
  max-width: 120px;
  max-height: 60px;
}
</style>
