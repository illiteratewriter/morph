import {
  getBlock,
  getComment,
  getMainFont,
  getProp,
  getValue,
  isBasic,
  isBlock,
  isCapture,
  isComment,
  isEnd,
  isFontable,
  isGroup,
  isList,
  isProp,
  isUserComment,
  stemStylesFromProp,
  warn,
} from './helpers.js'
import getLoc from './get-loc.js'
import getMeta from './get-meta.js'
import getPropTypes from './get-prop-types.js'
import getTags from './get-tags.js'

export default (rtext, skipComments = true) => {
  // convert crlf to lf
  const text = rtext.replace(/\r\n/g, '\n')
  const fonts = {}
  const lines = text.split('\n').map(line => line.trim())
  const props = []
  const stack = []
  const views = []
  let lastCapture

  const getChildrenProxyMap = block => {
    const childrenProxyMap = {}

    block.children.forEach((child, i) => {
      let maybeName = child.is || child.name
      let name = maybeName
      let next = 1
      while (name in childrenProxyMap) {
        name = `${maybeName}${next}`
        next++
      }
      childrenProxyMap[name] = i
    })

    return Object.keys(childrenProxyMap).length === 0 ? null : childrenProxyMap
  }

  const lookForFonts = block => {
    if (block.properties && (isFontable(block.name) || !block.isBasic)) {
      const fontFamilyProp = block.properties.find(p => p.name === 'fontFamily')

      if (fontFamilyProp) {
        const fontFamily = getMainFont(fontFamilyProp.value)
        const fontWeightProp = block.properties.find(
          p => p.name === 'fontWeight'
        )
        const fontWeight = fontWeightProp
          ? fontWeightProp.value.toString()
          : '400'

        if (!fonts[fontFamily]) fonts[fontFamily] = []
        if (!fonts[fontFamily].includes(fontWeight)) {
          fonts[fontFamily].push(fontWeight)
        }
      }
    }
  }

  const end = (block, endLine) => {
    block.loc.end = {
      line: endLine,
      column: Math.max(0, lines[endLine].length - 1),
    }

    if (block.isGroup && !block.isBasic) {
      block.childrenProxyMap = getChildrenProxyMap(block)
    }

    if (!block.properties) {
      block.properties = []
    }

    if (stack.length === 0) {
      // if we're the last block on the stack, then this is the view!
      views.push(block)
      return true
    }
    return false
  }

  const parseBlock = (line, i) => {
    const { block: name, is } = getBlock(line)
    let shouldPushToStack = false

    const block = {
      type: 'Block',
      name,
      isBasic: isBasic(name),
      isGroup: false,
      loc: getLoc(i, 0),
      scoped: {},
    }

    if (is) {
      block.is = is

      if (isCapture(name)) {
        if (lastCapture) {
          lastCapture.captureNext = is
        }
        lastCapture = block
      }
    }

    const last = stack[stack.length - 1]
    if (last) {
      if (last.isGroup) {
        if (last.isList) {
          if (block.isBasic) {
            warn(
              `A basic block can't be inside a List.\nPut 1 empty line before`,
              block
            )
            shouldPushToStack = true
          } else if (last.children.length > 0) {
            warn(
              `A List can only have one view inside. This block is outside of it.\nPut 1 empty line before.`,
              block
            )
            shouldPushToStack = true
          } else {
            last.children.push(block)
          }
        } else {
          last.children.push(block)
        }
      } else {
        // the block is inside a block that isn't a group
        end(stack.pop(), i)

        if (views[0].isGroup) {
          warn(
            lines[i - 1] === ''
              ? `put 1 empty line before`
              : `put 2 empty lines before`,
            block
          )
        } else {
          warn(`add Vertical at the top`, block)
        }
        shouldPushToStack = true
      }
    } else if (views.length > 0) {
      // the block is outside the top level block
      let newLinesBeforePreviousBlock = 1
      while (isEnd(lines[i - newLinesBeforePreviousBlock])) {
        newLinesBeforePreviousBlock++
      }

      const help = []
      if (!views[0].isGroup) {
        help.push(`add Vertical at the top`)
      }
      if (newLinesBeforePreviousBlock > 2) {
        const linesToRemove = newLinesBeforePreviousBlock - 2
        help.push(
          `remove ${linesToRemove} empty line${
            linesToRemove > 1 ? 's' : ''
          } before`
        )
      }
      warn(help.join(', '), block)
    }

    if (isGroup(name)) {
      block.isGroup = true
      block.isList = isList(name)
      block.children = []

      shouldPushToStack = true
    }

    if (shouldPushToStack || stack.length === 0) {
      stack.push(block)
    }
  }

  const parseProps = (i, block) => {
    let endOfBlockIndex = i
    while (
      endOfBlockIndex < lines.length - 1 &&
      !isBlock(lines[endOfBlockIndex + 1])
    ) {
      endOfBlockIndex++
    }

    const properties = []

    let inScope = false

    for (let j = i; j <= endOfBlockIndex; j++) {
      const line = lines[j]

      if (isProp(line)) {
        const [propRaw, value] = getProp(line)
        const [prop, stemmedTag] = stemStylesFromProp(block, propRaw)
        const tags = getTags(prop, value)
        if (stemmedTag) {
          tags[stemmedTag] = true
        }

        if (tags.code) {
          props.push({ type: block.name, prop, value })
        }

        if (tags.style && tags.code) {
          block.maybeAnimated = true
        }

        if (tags.scope) {
          inScope = tags.scope
        } else if (inScope) {
          if (!block.scoped[prop]) block.scoped[prop] = {}
          block.scoped[prop][inScope] = properties.length
        }

        properties.push({
          type: 'Property',
          loc: getLoc(j, line.indexOf(propRaw), line.length - 1),
          name: prop,
          nameRaw: propRaw,
          inScope,
          tags,
          meta: getMeta(value, line, j),
          value: getValue(value),
        })
      } else if (isComment(line) && !skipComments) {
        let [value] = getComment(line)

        const userComment = isUserComment(line)
        if (userComment) {
          value = getComment(value)
        }

        properties.push({
          type: 'Property',
          loc: getLoc(j, 0, line.length - 1),
          value,
          tags: { comment: true, userComment },
        })
      }
    }

    block.properties = properties
  }

  lines.forEach((line, i) => {
    if (isBlock(line)) {
      parseBlock(line, i)
    } else if (isProp(line) || isComment(line)) {
      let block = stack[stack.length - 1] || views[views.length - 1]
      // TODO add warning
      if (!block) return
      if (block.isGroup && block.children.length > 0) {
        block = block.children[block.children.length - 1]
      }

      if (!block.properties) {
        parseProps(i, block)
        if (block.properties) {
          block.loc.end = block.properties[block.properties.length - 1].loc.end
        }
        lookForFonts(block)
      }
    } else if (isEnd(line) && stack.length > 0) {
      end(stack.pop(), i)
    }
  })

  if (stack.length > 0) {
    while (!end(stack.pop(), lines.length - 1)) {}
  }

  return {
    fonts,
    props: getPropTypes(props),
    views,
  }
}
