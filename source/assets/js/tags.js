(function() {
  'use strict'

  var list = document.querySelector('.tag-cloud-list')
  if (!list) return

  var tags = list.querySelectorAll('a')
  if (!tags.length) return

  var isTouch = 'ontouchstart' in window

  tags.forEach(function(tag) {
    // 悬浮时暂停浮动动画，由 JS 接管 transform
    tag.addEventListener('mouseenter', function() {
      tag.style.animationPlayState = 'paused'
    })
    tag.addEventListener('mouseleave', function() {
      tag.style.animationPlayState = ''
    })

    if (isTouch) return

    // ---- 3D 倾斜 + Z 轴凸起 ----
    tag.addEventListener('mousemove', function(e) {
      var rect = tag.getBoundingClientRect()
      var x = e.clientX - rect.left
      var y = e.clientY - rect.top
      var cx = rect.width / 2
      var cy = rect.height / 2

      // 鼠标到中心的距离比例 (0~1)
      var dist = Math.min(1, Math.sqrt(
        Math.pow((x - cx) / cx, 2) + Math.pow((y - cy) / cy, 2)
      ))

      // 涟漪扩散原点
      tag.style.setProperty('--ripple-x', Math.round((x / rect.width) * 100) + '%')
      tag.style.setProperty('--ripple-y', Math.round((y / rect.height) * 100) + '%')

      // Z 轴凸起：鼠标越靠近中心凸起越高 (10~24px)
      var translateZ = 24 - dist * 14

      // 3D 倾斜 (±8°)
      var rotateX = ((y - cy) / cy) * -8
      var rotateY = ((x - cx) / cx) * 8

      tag.style.transform =
        'perspective(500px) translateZ(' + translateZ + 'px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg)'
    })

    // 移出恢复
    tag.addEventListener('mouseleave', function() {
      tag.style.transform = ''
      tag.style.setProperty('--ripple-x', '50%')
      tag.style.setProperty('--ripple-y', '50%')
    })
  })
})()
