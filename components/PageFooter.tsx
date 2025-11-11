import Giscus, { type Repo } from '@giscus/react'
import * as React from 'react'

import * as config from '@/lib/config'

import styles from './styles.module.css'

export const PageFooter: React.FC<{
  isBlogPost: boolean
}> = ({ isBlogPost }) => {
  // only display comments and page actions on blog post pages
  if (isBlogPost) {
    const hasGiscusConfig =
      config.giscusRepo &&
      config.giscusRepoId &&
      config.giscusCategory &&
      config.giscusCategoryId

    if (!hasGiscusConfig) {
      return null
    }

    return (
      <div className={styles.comments}>
        <Giscus
          id='comments'
          repo={config.giscusRepo as Repo}
          repoId={config.giscusRepoId!}
          category={config.giscusCategory!}
          categoryId={config.giscusCategoryId!}
          mapping='pathname'
          reactionsEnabled='1'
          emitMetadata='0'
          inputPosition='bottom'
          theme='dark_tritanopia'
          lang='ko'
          loading='lazy'
        />
      </div>
    )
  }

  return null
}
