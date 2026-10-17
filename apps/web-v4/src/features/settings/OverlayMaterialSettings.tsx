import { CalendarIcon, StatusRingIcon, TagIcon } from '../../components/icons/knowra';
import { Button } from '../../components/ui/button/Button';
import { SegmentedButton, SegmentedControl } from '../../components/ui/button/SegmentedControl';
import { Menu, MenuItem, MenuPopover, MenuTrigger, SubmenuTrigger } from '../../components/ui/overlay/Menu';
import { setNotesIndexAppearance, useNotesIndexAppearance } from '../notes/notesIndexAppearanceModel';
import { useCompactLayout } from '../../shell/useCompactLayout';
import styles from './SettingsView.module.css';

export function OverlayMaterialSettings() {
  const { overlayMaterial } = useNotesIndexAppearance();
  const compact = useCompactLayout();
  return <section className={styles.group} aria-labelledby="settings-appearance-heading">
    <h3 id="settings-appearance-heading">外观</h3>
    <div className={styles.settingList}>
      <div className={`${styles.settingRow} ${styles.materialRow}`}>
        <div className={styles.settingCopy}>
          <h4>浮层材质</h4>
          <p>通透玻璃轻盈透亮，磨砂亚克力柔和朦胧。应用于下拉菜单与弹出面板，切换后即时保存。</p>
        </div>
        <div className={`${styles.settingControl} ${styles.materialControl}`}>
          <SegmentedControl aria-label="浮层材质">
            <SegmentedButton aria-pressed={overlayMaterial === 'glass'} onPress={() => setNotesIndexAppearance({ overlayMaterial: 'glass' })}>通透玻璃</SegmentedButton>
            <SegmentedButton aria-pressed={overlayMaterial === 'acrylic'} onPress={() => setNotesIndexAppearance({ overlayMaterial: 'acrylic' })}>磨砂亚克力</SegmentedButton>
          </SegmentedControl>
          <MenuTrigger>
            <Button size="compact">预览菜单</Button>
            <MenuPopover>
              <Menu ariaLabel="材质预览">
                <SubmenuTrigger>
                  <MenuItem id="status" icon={<StatusRingIcon size={16} />}>状态</MenuItem>
                  <MenuPopover placement={compact ? 'bottom start' : 'right top'}>
                    <Menu ariaLabel="状态预览">
                      <MenuItem id="draft">草稿</MenuItem>
                      <MenuItem id="active">进行中</MenuItem>
                      <MenuItem id="done">已完成</MenuItem>
                    </Menu>
                  </MenuPopover>
                </SubmenuTrigger>
                <MenuItem id="tags" icon={<TagIcon size={16} />}>标签</MenuItem>
                <MenuItem id="updated" icon={<CalendarIcon size={16} />}>更新时间</MenuItem>
                <MenuItem id="disabled" isDisabled>不可用选项</MenuItem>
              </Menu>
            </MenuPopover>
          </MenuTrigger>
        </div>
      </div>
    </div>
  </section>;
}
