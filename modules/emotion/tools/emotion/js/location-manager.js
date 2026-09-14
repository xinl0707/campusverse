/* ========================================
   地点管理模块
   负责自定义地点的添加、编辑、删除
   ======================================== */

const LocationManager = {
  containerId: 'location-modal',
  addingMode: false,
  editingLocation: null,

  // 预设图标列表
  iconOptions: [
    '📚', '🍜', '🏠', '🏀', '📖', '🏃', '🔬', '🏫',
    '☕', '🌳', '🎵', '🎨', '💻', '🏋️', '🎭', '🌸',
    '🐱', '🛒', '🎪', '💊', '💇', '📮', '🏦', '🎬'
  ],

  /**
   * 初始化
   */
  init() {
    this.bindEvents();
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 监听编辑自定义地点事件
    document.addEventListener('editCustomLocation', (e) => {
      this.showEditModal(e.detail);
    });
  },

  /**
   * 显示添加地点模态框
   * @param {number} x - 地图 x 坐标（可选）
   * @param {number} y - 地图 y 坐标（可选）
   */
  showAddModal(x, y) {
    this.addingMode = true;
    this.editingLocation = null;

    const modal = document.getElementById(this.containerId);
    if (!modal) return;

    modal.innerHTML = this.buildModalHTML('添加地点', null, x, y);
    modal.classList.add('active');

    this.bindModalEvents(modal);
  },

  /**
   * 显示编辑模态框
   */
  showEditModal(location) {
    this.addingMode = false;
    this.editingLocation = location;

    const modal = document.getElementById(this.containerId);
    if (!modal) return;

    modal.innerHTML = this.buildModalHTML('编辑地点', location);
    modal.classList.add('active');

    this.bindModalEvents(modal);
  },

  /**
   * 构建模态框 HTML
   */
  buildModalHTML(title, location, defaultX, defaultY) {
    const name = location ? location.name : '';
    const icon = location ? location.icon : '📍';

    return `
      <div class="modal-content">
        <h3 class="modal-title">${title}</h3>

        <div class="form-group">
          <label class="form-label">地点名称</label>
          <input type="text" class="input-field" id="loc-name"
                 value="${name}" placeholder="例如：图书馆三楼">
        </div>

        <div class="form-group">
          <label class="form-label">选择图标</label>
          <div class="icon-picker" id="icon-picker">
            ${this.iconOptions.map(ic => `
              <button class="icon-option ${ic === icon ? 'selected' : ''}"
                      data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
        </div>

        ${!location ? `
          <div class="form-group">
            <label class="form-label">在地图上点击选择位置</label>
            <p class="form-hint">点击下方按钮后，在地图上点击你想放置的位置</p>
            <button class="btn-secondary" id="pick-location-btn">📍 在地图上选位置</button>
            <span class="picked-location-text" id="picked-location-text">
              ${defaultX ? `已选择位置 (${Math.round(defaultX)}, ${Math.round(defaultY)})` : '未选择'}
            </span>
          </div>
        ` : ''}

        <div class="modal-actions">
          ${location ? `
            <button class="btn-danger" id="delete-location-btn">删除地点</button>
          ` : ''}
          <button class="btn-secondary" id="cancel-location-btn">取消</button>
          <button class="btn-primary" id="save-location-btn">保存</button>
        </div>
      </div>
    `;
  },

  /**
   * 绑定模态框事件
   */
  bindModalEvents(modal) {
    let pickedX = null;
    let pickedY = null;
    let pickingMode = false;
    let selectedIcon = this.editingLocation ? this.editingLocation.icon : '📍';

    // 图标选择
    const iconPicker = modal.querySelector('#icon-picker');
    if (iconPicker) {
      iconPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-option');
        if (!btn) return;
        iconPicker.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedIcon = btn.dataset.icon;
      });
    }

    // 在地图上选位置
    const pickBtn = modal.querySelector('#pick-location-btn');
    if (pickBtn) {
      pickBtn.addEventListener('click', () => {
        pickingMode = true;
        pickBtn.textContent = '👆 请在地图上点击...';
        pickBtn.disabled = true;

        const mapCanvas = document.querySelector('#map-container canvas');
        if (mapCanvas) {
          const handler = (e) => {
            if (!pickingMode) return;
            const rect = mapCanvas.getBoundingClientRect();
            pickedX = e.clientX - rect.left;
            pickedY = e.clientY - rect.top;
            const text = modal.querySelector('#picked-location-text');
            if (text) text.textContent = `已选择位置 (${Math.round(pickedX)}, ${Math.round(pickedY)})`;
            pickingMode = false;
            pickBtn.textContent = '📍 重新选择';
            pickBtn.disabled = false;
            mapCanvas.removeEventListener('click', handler);
          };
          mapCanvas.addEventListener('click', handler);
        }
      });
    }

    // 取消按钮
    const cancelBtn = modal.querySelector('#cancel-location-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeModal(modal));
    }

    // 关闭模态框（点击遮罩）
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal(modal);
    });

    // 保存按钮
    const saveBtn = modal.querySelector('#save-location-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameInput = modal.querySelector('#loc-name');
        const name = nameInput ? nameInput.value.trim() : '';

        if (!name) {
          showToast('请输入地点名称');
          return;
        }

        if (this.addingMode && !pickedX && !pickedY) {
          // 默认放在地图中央
          pickedX = CampusMap.config.width / 2;
          pickedY = CampusMap.config.height / 2;
        }

        if (this.addingMode) {
          CampusMap.addCustomLocation(name, selectedIcon, pickedX, pickedY);
          showToast('地点已添加 📍');
        } else if (this.editingLocation) {
          CampusMap.updateCustomLocation(this.editingLocation.id, {
            name,
            icon: selectedIcon
          });
          showToast('地点已更新 ✅');
        }

        this.closeModal(modal);
      });
    }

    // 删除按钮
    const deleteBtn = modal.querySelector('#delete-location-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (this.editingLocation) {
          CampusMap.removeCustomLocation(this.editingLocation.id);
          showToast('地点已删除 🗑️');
          this.closeModal(modal);
        }
      });
    }
  },

  /**
   * 关闭模态框
   */
  closeModal(modal) {
    modal.classList.remove('active');
    modal.innerHTML = '';
    this.addingMode = false;
    this.editingLocation = null;
  }
};
