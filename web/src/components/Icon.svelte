<script lang="ts">
  interface Props {
    name: string;
    class?: string;
    [key: string]: any;
  }

  let { name, class: className, ...restProps }: Props = $props();
  const spriteUrl = $derived(`/_astro/icons-sprite.svg#${name}`);
</script>

<span class={className} {...restProps}>
  <svg>
    <use href={spriteUrl} />
  </svg>
</span>

<style>
  @layer {
    span {
      width: 1em;
      height: 1em;
    }
  }
  span {
    display: inline-flex;
    align-self: center;
  }
  svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
</style>
