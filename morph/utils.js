import safe from './react/safe.js'
import wrap from './react/wrap.js'

const safeScope = value =>
  typeof value === 'string' && !isCode(value) ? JSON.stringify(value) : value

export const asScopedValue = (obj, node, parent) => {
  const defaultValue = node.inScope ? null : node.value
  let value = []

  for (const scope in obj) {
    const scopeProp = parent.properties.find(
      prop => prop.inScope === scope && prop.nameRaw === node.nameRaw
    )
    value.push(`${scope}? ${safeScope(scopeProp.value)}`)
  }

  return `${value.join(' : ')} : ${safeScope(defaultValue)}`
}

export const checkParentStem = (node, styleKey) => {
  if (styleKey !== 'hover' || !node.parent) return false

  const matchingParentStem = node.parent.properties.some(
    prop => prop.tags.hover
  )

  return matchingParentStem && (node.parent.is || node.parent.name)
}

const INTERPOLATION = /\${(.+)}/
export const isInterpolation = str => INTERPOLATION.test(str)
export const deinterpolate = str => {
  const match = str.match(INTERPOLATION)
  return match ? match[1] : str
}

export const getObjectAsString = obj =>
  wrap(
    Object.keys(obj)
      .map(k => {
        const v =
          typeof obj[k] === 'object' && hasKeys(obj[k])
            ? getObjectAsString(obj[k])
            : obj[k]
        return `${JSON.stringify(k)}: ${v}`
      })
      .join(',')
  )

export const getPropertiesAsObject = list => {
  const obj = {}

  list.forEach(prop => {
    obj[prop.name] = safeScope(prop.value)
  })

  return getObjectAsString(obj)
}

export const getProp = (node, key) => {
  const finder =
    typeof key === 'string' ? p => p.name === key : p => key.test(p.name)

  return node.properties && node.properties.find(finder)
}

export const getScope = node => node.value.split('when ')[1]

const maybeSafe = node =>
  node.tags.code
    ? node.value
    : typeof node.value === 'string' ? safe(node.value) : node.value

export const getScopedProps = (propNode, blockNode) => {
  const scopedProps = blockNode.properties
    .filter(prop => prop.name === propNode.name && prop.inScope)
    .reverse()

  let scopedConditional = maybeSafe(propNode)

  scopedProps.forEach(prop => {
    scopedConditional =
      `${prop.inScope} ? ${maybeSafe(prop)} : ` + scopedConditional
  })

  return scopedConditional
}

const styleStems = ['hover', 'focus', 'placeholder', 'disabled', 'print']
export const getStyleType = node =>
  styleStems.find(tag => isTag(node, tag)) || 'base'
export const hasKeys = obj => Object.keys(obj).length > 0
export const hasKeysInChildren = obj =>
  Object.keys(obj).some(k => hasKeys(obj[k]))

export const hasProp = (node, key, match) => {
  const prop = getProp(node, key)
  if (!prop) return false
  return typeof match === 'function' ? match(prop.value) : true
}

export const hasDefaultProp = (node, parent) =>
  parent.properties.some(prop => prop.nameRaw === node.nameRaw && !prop.inScope)

export const CODE_EXPLICIT = /^{.+}$/
export const isCodeExplicit = str => CODE_EXPLICIT.test(str)
export const isCode = node =>
  typeof node === 'string'
    ? /props|item|index/.test(node) || isCodeExplicit(node)
    : isTag(node, 'code')
export const isStyle = node => isTag(node, 'style')
export const isTag = (node, tag) => node.tags[tag]

export const getActionableParent = node => {
  if (!node.parent) return false
  if (node.parent.action) return node.parent
  return getActionableParent(node.parent)
}

export const getAllowedStyleKeys = node => {
  if (node.isCapture) {
    return ['base', 'focus', 'hover', 'disabled', 'placeholder']
  } else if (node.action || getActionableParent(node)) {
    return ['base', 'focus', 'hover', 'disabled']
  }
  return ['base', 'focus']
}

export const isList = node =>
  node && node.type === 'Block' && node.name === 'List'
