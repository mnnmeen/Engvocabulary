'use client';

import { Anchor, Box, Burger, Container, Group, Text } from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDisclosure } from '@mantine/hooks';
import Image from 'next/image';
import classes from './DoubleHeader.module.css';


const mainLinks = [
  { link: '/', label: '首頁' },
  { link: '/all-words', label: '所有單字' },
  { link: '/training', label: '訓練' },
  { link: '/add-word', label: '新增單字' },
  { link: '#', label: '個人帳號' },
];

export function DoubleHeader() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();

  const isActiveLink = (link: string) => {
    if (link === '#') {
      return false;
    }
    if (link === '/') {
      return pathname === '/';
    }
    return pathname === link || pathname.startsWith(`${link}/`);
  };

  const mainItems = mainLinks.map((item, index) => (
    <Anchor
      component={Link}
      href={item.link}
      key={item.label}
      className={classes.mainLink}
      data-active={isActiveLink(item.link) || undefined}
      onClick={close}
    >
      {item.label}
    </Anchor>
  ));

  

  return (
    <header className={classes.header}>
      <Container className={classes.inner} size="lg">
        <Group gap="xs" align="center" wrap="nowrap">
          <Image
            src="/memora-logo.png"   // 放在 public/memora-logo.png
            alt="Memora logo"
            width={68}
            height={68}
            className={classes.logo}
          />
          <Text fw={700} size="md" style={{ color: '#204280' }} className={classes.brand}>
            Memora單字記憶
          </Text>
        </Group>

        <Box className={classes.links}>
          <Group gap={0} justify="flex-end" className={classes.mainLinks}>
            {mainItems}
          </Group>
        </Box>

        <Burger
          opened={opened}
          onClick={toggle}
          className={classes.burger}
          size="sm"
          hiddenFrom="sm"
          aria-label="Toggle navigation"
        />
      </Container>
      {opened && (
        <Container className={classes.mobileMenu} size="lg" hiddenFrom="sm">
          <Box className={classes.mobileMenuInner}>{mainItems}</Box>
        </Container>
      )}
    </header>
  );
}