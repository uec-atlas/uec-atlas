<script lang="ts">
  import Icon from "@/components/Icon.svelte";
  import { formatLangString } from "@/utils/rdf";
  import { expandURI } from "@/utils/url";
  import type { I18NString } from "generated/common";
  import { chunk } from "remeda";

  type TagWithIcon = {
    label: string;
    icon: string;
  };

  interface LinkCardListItem {
    name?: I18NString;
    uri: string;
    tags: (string | TagWithIcon)[];
  }

  interface Props {
    items: LinkCardListItem[];
    fallbackName?: I18NString;
  }

  const { items, fallbackName }: Props = $props();

  const PAGE_SIZE = 10;
  const MAX_BUTTONS = 7;

  let currentPage = $state(0);

  const pagedItems = $derived(chunk(items, PAGE_SIZE));
  const totalPages = $derived(pagedItems.length);
  const displayedPages = $derived.by(() => {
    if (totalPages <= MAX_BUTTONS) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    const boundary = 2;

    if (currentPage <= boundary) {
      return [0, 1, 2, 3, 4, "...", totalPages - 1];
    }

    if (currentPage >= totalPages - boundary - 1) {
      return [
        0,
        "...",
        totalPages - 5,
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
      ];
    }
    return [
      0,
      "...",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "...",
      totalPages - 1,
    ];
  });

  $effect(() => {
    if (items) {
      currentPage = 0;
    }
  });
</script>

<ul class="flex flex-col gap-1">
  {#each pagedItems[currentPage] ?? [] as item}
    <li>
      <a
        class="flex flex-row items-center justify-between rounded-md px-3 py-2 hover:bg-base-200 transition-colors border border-base-300 hover:border-primary"
        href={expandURI(item.uri)}
      >
        <div class="flex flex-col gap-1">
          <p class="flex flex-row gap-2 items-baseline">
            <span class="font-bold">
              {formatLangString(item.name, "ja", fallbackName)}
            </span>
            {#each item.tags as tag}
              {#if typeof tag === "string"}
                <span class="d-badge d-badge-primary d-badge-soft d-badge-sm">
                  {tag}
                </span>
              {:else}
                <span
                  class="d-badge d-badge-primary d-badge-soft d-badge-sm flex flex-row gap-1 items-center"
                >
                  <Icon name={tag.icon} />
                  {tag.label}
                </span>
              {/if}
            {/each}
          </p>
        </div>
        <Icon name="mdi:chevron-right" />
      </a>
    </li>
  {/each}
</ul>

{#if totalPages > 1}
  <div class="flex flex-col items-center gap-2">
    <span class="text-sm">
      {items.length}件中 {currentPage * PAGE_SIZE + 1} -
      {Math.min((currentPage + 1) * PAGE_SIZE, items.length)}件
    </span>
    <div class="d-join">
      <button
        class="d-join-item d-btn d-btn-sm"
        disabled={currentPage === 0}
        onclick={() => (currentPage -= 1)}
        aria-label="前のページへ"
      >
        <Icon name="mdi:chevron-left" />
      </button>
      {#each displayedPages as page}
        {#if typeof page === "number"}
          <button
            class="d-join-item d-btn d-btn-sm {page === currentPage
              ? 'd-btn-primary'
              : ''}"
            onclick={() => (currentPage = page)}
          >
            {page + 1}
          </button>
        {:else}
          <button class="d-join-item d-btn d-btn-sm d-btn-disabled" disabled>
            ...
          </button>
        {/if}
      {/each}
      <button
        class="d-join-item d-btn d-btn-sm"
        disabled={currentPage === totalPages - 1}
        onclick={() => (currentPage += 1)}
        aria-label="次のページへ"
      >
        <Icon name="mdi:chevron-right" />
      </button>
    </div>
  </div>
{/if}
