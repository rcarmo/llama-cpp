
/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913/q6-build/pair.o:     file format elf64-x86-64


Disassembly of section .text:

0000000000000000 <q6_pair2>:
   0:	55                   	push   %rbp
   1:	41 57                	push   %r15
   3:	41 56                	push   %r14
   5:	41 55                	push   %r13
   7:	41 54                	push   %r12
   9:	53                   	push   %rbx
   a:	48 81 ec 78 01 00 00 	sub    $0x178,%rsp
  11:	40 84 ff             	test   %dil,%dil
  14:	0f 85 34 04 00 00    	jne    44e <q6_pair2+0x44e>
  1a:	49 89 f6             	mov    %rsi,%r14
  1d:	48 89 54 24 08       	mov    %rdx,0x8(%rsp)
  22:	c1 ff 08             	sar    $0x8,%edi
  25:	85 ff                	test   %edi,%edi
  27:	0f 8e bd 03 00 00    	jle    3ea <q6_pair2+0x3ea>
  2d:	4d 89 cf             	mov    %r9,%r15
  30:	4d 89 c4             	mov    %r8,%r12
  33:	49 89 cd             	mov    %rcx,%r13
  36:	89 f8                	mov    %edi,%eax
  38:	49 81 c5 d0 00 00 00 	add    $0xd0,%r13
  3f:	48 69 e8 24 01 00 00 	imul   $0x124,%rax,%rbp
  46:	c4 41 00 57 ff       	vxorps %xmm15,%xmm15,%xmm15
  4b:	c4 e2 7d 19 05 00 00 	vbroadcastsd 0x0(%rip),%ymm0        # 54 <q6_pair2+0x54>
  52:	00 00 
  54:	c5 fc 11 44 24 30    	vmovups %ymm0,0x30(%rsp)
  5a:	c4 e2 7d 19 05 00 00 	vbroadcastsd 0x0(%rip),%ymm0        # 63 <q6_pair2+0x63>
  61:	00 00 
  63:	c5 fc 11 44 24 10    	vmovups %ymm0,0x10(%rsp)
  69:	31 db                	xor    %ebx,%ebx
  6b:	c5 e8 57 d2          	vxorps %xmm2,%xmm2,%xmm2
  6f:	90                   	nop
  70:	c5 fc 11 94 24 30 01 	vmovups %ymm2,0x130(%rsp)
  77:	00 00 
  79:	c5 7c 11 bc 24 50 01 	vmovups %ymm15,0x150(%rsp)
  80:	00 00 
  82:	41 0f b7 7d 00       	movzwl 0x0(%r13),%edi
  87:	c5 f8 77             	vzeroupper
  8a:	e8 00 00 00 00       	call   8f <q6_pair2+0x8f>
  8f:	c5 fa 11 44 24 04    	vmovss %xmm0,0x4(%rsp)
  95:	c4 41 7a 6f 45 f0    	vmovdqu -0x10(%r13),%xmm8
  9b:	c4 c1 7e 6f 45 b0    	vmovdqu -0x50(%r13),%ymm0
  a1:	c4 c1 7e 6f 8d 30 ff 	vmovdqu -0xd0(%r13),%ymm1
  a8:	ff ff 
  aa:	c4 c1 7e 6f 95 50 ff 	vmovdqu -0xb0(%r13),%ymm2
  b1:	ff ff 
  b3:	c4 41 7e 6f a5 70 ff 	vmovdqu -0x90(%r13),%ymm12
  ba:	ff ff 
  bc:	c4 41 7e 6f 6d 90    	vmovdqu -0x70(%r13),%ymm13
  c2:	c5 fe 6f 74 24 30    	vmovdqu 0x30(%rsp),%ymm6
  c8:	c5 f5 db e6          	vpand  %ymm6,%ymm1,%ymm4
  cc:	c5 d5 71 f0 04       	vpsllw $0x4,%ymm0,%ymm5
  d1:	c5 7e 6f 74 24 10    	vmovdqu 0x10(%rsp),%ymm14
  d7:	c5 8d db ed          	vpand  %ymm5,%ymm14,%ymm5
  db:	c5 d5 eb fc          	vpor   %ymm4,%ymm5,%ymm7
  df:	c5 fe 7f bc 24 10 01 	vmovdqu %ymm7,0x110(%rsp)
  e6:	00 00 
  e8:	c5 ed db e6          	vpand  %ymm6,%ymm2,%ymm4
  ec:	c5 d5 71 f0 02       	vpsllw $0x2,%ymm0,%ymm5
  f1:	c5 8d db ed          	vpand  %ymm5,%ymm14,%ymm5
  f5:	c5 55 eb d4          	vpor   %ymm4,%ymm5,%ymm10
  f9:	c5 7e 7f 94 24 f0 00 	vmovdqu %ymm10,0xf0(%rsp)
 100:	00 00 
 102:	c5 f5 71 d1 04       	vpsrlw $0x4,%ymm1,%ymm1
 107:	c5 f5 db ce          	vpand  %ymm6,%ymm1,%ymm1
 10b:	c5 8d db e0          	vpand  %ymm0,%ymm14,%ymm4
 10f:	c5 75 eb dc          	vpor   %ymm4,%ymm1,%ymm11
 113:	c5 7e 7f 9c 24 d0 00 	vmovdqu %ymm11,0xd0(%rsp)
 11a:	00 00 
 11c:	c5 f5 71 d2 04       	vpsrlw $0x4,%ymm2,%ymm1
 121:	c4 e2 7d 78 25 00 00 	vpbroadcastb 0x0(%rip),%ymm4        # 12a <q6_pair2+0x12a>
 128:	00 00 
 12a:	c5 f5 db cc          	vpand  %ymm4,%ymm1,%ymm1
 12e:	c5 fd 71 d0 02       	vpsrlw $0x2,%ymm0,%ymm0
 133:	c4 e2 7d 78 2d 00 00 	vpbroadcastb 0x0(%rip),%ymm5        # 13c <q6_pair2+0x13c>
 13a:	00 00 
 13c:	c5 fd db c5          	vpand  %ymm5,%ymm0,%ymm0
 140:	c5 7d eb f9          	vpor   %ymm1,%ymm0,%ymm15
 144:	c5 7e 7f 7c 24 70    	vmovdqu %ymm15,0x70(%rsp)
 14a:	c4 c1 39 60 c0       	vpunpcklbw %xmm8,%xmm8,%xmm0
 14f:	c5 fb 70 c8 50       	vpshuflw $0x50,%xmm0,%xmm1
 154:	c5 f9 70 c9 50       	vpshufd $0x50,%xmm1,%xmm1
 159:	c4 e2 7d 20 d9       	vpmovsxbw %xmm1,%ymm3
 15e:	c5 fe 7f 9c 24 b0 00 	vmovdqu %ymm3,0xb0(%rsp)
 165:	00 00 
 167:	c5 fb 70 c8 fa       	vpshuflw $0xfa,%xmm0,%xmm1
 16c:	c5 f9 70 c9 50       	vpshufd $0x50,%xmm1,%xmm1
 171:	c4 e2 7d 20 d1       	vpmovsxbw %xmm1,%ymm2
 176:	c5 fe 7f 94 24 90 00 	vmovdqu %ymm2,0x90(%rsp)
 17d:	00 00 
 17f:	c5 fa 70 c8 50       	vpshufhw $0x50,%xmm0,%xmm1
 184:	c5 f9 70 c9 fa       	vpshufd $0xfa,%xmm1,%xmm1
 189:	c4 e2 7d 20 e1       	vpmovsxbw %xmm1,%ymm4
 18e:	c5 fe 7f 64 24 50    	vmovdqu %ymm4,0x50(%rsp)
 194:	c5 fa 70 c0 fa       	vpshufhw $0xfa,%xmm0,%xmm0
 199:	c5 f9 70 c0 fa       	vpshufd $0xfa,%xmm0,%xmm0
 19e:	c4 62 7d 20 c8       	vpmovsxbw %xmm0,%ymm9
 1a3:	c4 c2 45 04 44 1c 04 	vpmaddubsw 0x4(%r12,%rbx,1),%ymm7,%ymm0
 1aa:	c5 e5 f5 c0          	vpmaddwd %ymm0,%ymm3,%ymm0
 1ae:	c4 c2 2d 04 4c 1c 24 	vpmaddubsw 0x24(%r12,%rbx,1),%ymm10,%ymm1
 1b5:	c5 ed f5 c9          	vpmaddwd %ymm1,%ymm2,%ymm1
 1b9:	c5 f5 fe c0          	vpaddd %ymm0,%ymm1,%ymm0
 1bd:	c4 c2 25 04 4c 1c 44 	vpmaddubsw 0x44(%r12,%rbx,1),%ymm11,%ymm1
 1c4:	c4 c2 05 04 54 1c 64 	vpmaddubsw 0x64(%r12,%rbx,1),%ymm15,%ymm2
 1cb:	c5 dd f5 c9          	vpmaddwd %ymm1,%ymm4,%ymm1
 1cf:	c5 b5 f5 d2          	vpmaddwd %ymm2,%ymm9,%ymm2
 1d3:	c5 f5 fe ca          	vpaddd %ymm2,%ymm1,%ymm1
 1d7:	c5 7d fe f9          	vpaddd %ymm1,%ymm0,%ymm15
 1db:	c4 c1 7e 6f 45 d0    	vmovdqu -0x30(%r13),%ymm0
 1e1:	c5 9d db ce          	vpand  %ymm6,%ymm12,%ymm1
 1e5:	c5 ed 71 f0 04       	vpsllw $0x4,%ymm0,%ymm2
 1ea:	c5 8d db d2          	vpand  %ymm2,%ymm14,%ymm2
 1ee:	c5 6d eb d1          	vpor   %ymm1,%ymm2,%ymm10
 1f2:	c5 f5 71 f0 02       	vpsllw $0x2,%ymm0,%ymm1
 1f7:	c5 8d db c9          	vpand  %ymm1,%ymm14,%ymm1
 1fb:	c5 95 db d6          	vpand  %ymm6,%ymm13,%ymm2
 1ff:	c5 75 eb da          	vpor   %ymm2,%ymm1,%ymm11
 203:	c4 c1 75 71 d4 04    	vpsrlw $0x4,%ymm12,%ymm1
 209:	c5 f5 db ce          	vpand  %ymm6,%ymm1,%ymm1
 20d:	c5 8d db d0          	vpand  %ymm0,%ymm14,%ymm2
 211:	c5 75 eb e2          	vpor   %ymm2,%ymm1,%ymm12
 215:	c4 c1 75 71 d5 04    	vpsrlw $0x4,%ymm13,%ymm1
 21b:	c5 f5 db 0d 00 00 00 	vpand  0x0(%rip),%ymm1,%ymm1        # 223 <q6_pair2+0x223>
 222:	00 
 223:	c5 fd 71 d0 02       	vpsrlw $0x2,%ymm0,%ymm0
 228:	c5 fd db c5          	vpand  %ymm5,%ymm0,%ymm0
 22c:	c5 7d eb e9          	vpor   %ymm1,%ymm0,%ymm13
 230:	c4 c1 39 68 c0       	vpunpckhbw %xmm8,%xmm8,%xmm0
 235:	c5 fb 70 c8 50       	vpshuflw $0x50,%xmm0,%xmm1
 23a:	c5 f9 70 c9 50       	vpshufd $0x50,%xmm1,%xmm1
 23f:	c4 62 7d 20 f1       	vpmovsxbw %xmm1,%ymm14
 244:	c5 fb 70 c8 fa       	vpshuflw $0xfa,%xmm0,%xmm1
 249:	c5 f9 70 c9 50       	vpshufd $0x50,%xmm1,%xmm1
 24e:	c4 e2 7d 20 d1       	vpmovsxbw %xmm1,%ymm2
 253:	c4 c2 2d 04 8c 1c 84 	vpmaddubsw 0x84(%r12,%rbx,1),%ymm10,%ymm1
 25a:	00 00 00 
 25d:	c5 8d f5 c9          	vpmaddwd %ymm1,%ymm14,%ymm1
 261:	c4 c2 25 04 a4 1c a4 	vpmaddubsw 0xa4(%r12,%rbx,1),%ymm11,%ymm4
 268:	00 00 00 
 26b:	c5 ed f5 e4          	vpmaddwd %ymm4,%ymm2,%ymm4
 26f:	c5 dd fe e1          	vpaddd %ymm1,%ymm4,%ymm4
 273:	c5 fa 70 c8 50       	vpshufhw $0x50,%xmm0,%xmm1
 278:	c5 f9 70 c9 fa       	vpshufd $0xfa,%xmm1,%xmm1
 27d:	c4 e2 7d 20 c9       	vpmovsxbw %xmm1,%ymm1
 282:	c5 fa 70 c0 fa       	vpshufhw $0xfa,%xmm0,%xmm0
 287:	c5 f9 70 c0 fa       	vpshufd $0xfa,%xmm0,%xmm0
 28c:	c4 e2 7d 20 c0       	vpmovsxbw %xmm0,%ymm0
 291:	c4 c2 1d 04 ac 1c c4 	vpmaddubsw 0xc4(%r12,%rbx,1),%ymm12,%ymm5
 298:	00 00 00 
 29b:	c5 f5 f5 ed          	vpmaddwd %ymm5,%ymm1,%ymm5
 29f:	c4 c2 15 04 b4 1c e4 	vpmaddubsw 0xe4(%r12,%rbx,1),%ymm13,%ymm6
 2a6:	00 00 00 
 2a9:	c5 fd f5 f6          	vpmaddwd %ymm6,%ymm0,%ymm6
 2ad:	c5 d5 fe ee          	vpaddd %ymm6,%ymm5,%ymm5
 2b1:	c5 dd fe e5          	vpaddd %ymm5,%ymm4,%ymm4
 2b5:	c5 85 fe e4          	vpaddd %ymm4,%ymm15,%ymm4
 2b9:	c5 7c 10 bc 24 50 01 	vmovups 0x150(%rsp),%ymm15
 2c0:	00 00 
 2c2:	c4 c2 7d 20 f8       	vpmovsxbw %xmm8,%ymm7
 2c7:	c4 c1 45 f5 ac 1c 04 	vpmaddwd 0x104(%r12,%rbx,1),%ymm7,%ymm5
 2ce:	01 00 00 
 2d1:	c5 d5 72 f5 05       	vpslld $0x5,%ymm5,%ymm5
 2d6:	c5 dd fa e5          	vpsubd %ymm5,%ymm4,%ymm4
 2da:	c5 fa 10 5c 24 04    	vmovss 0x4(%rsp),%xmm3
 2e0:	c4 c1 62 59 2c 1c    	vmulss (%r12,%rbx,1),%xmm3,%xmm5
 2e6:	c4 e2 7d 18 ed       	vbroadcastss %xmm5,%ymm5
 2eb:	c5 fc 5b e4          	vcvtdq2ps %ymm4,%ymm4
 2ef:	c4 62 55 b8 fc       	vfmadd231ps %ymm4,%ymm5,%ymm15
 2f4:	c5 fe 6f a4 24 10 01 	vmovdqu 0x110(%rsp),%ymm4
 2fb:	00 00 
 2fd:	c4 c2 5d 04 64 1f 04 	vpmaddubsw 0x4(%r15,%rbx,1),%ymm4,%ymm4
 304:	c5 dd f5 a4 24 b0 00 	vpmaddwd 0xb0(%rsp),%ymm4,%ymm4
 30b:	00 00 
 30d:	c5 fe 6f ac 24 f0 00 	vmovdqu 0xf0(%rsp),%ymm5
 314:	00 00 
 316:	c4 c2 55 04 6c 1f 24 	vpmaddubsw 0x24(%r15,%rbx,1),%ymm5,%ymm5
 31d:	c5 d5 f5 ac 24 90 00 	vpmaddwd 0x90(%rsp),%ymm5,%ymm5
 324:	00 00 
 326:	c5 d5 fe e4          	vpaddd %ymm4,%ymm5,%ymm4
 32a:	c5 fe 6f ac 24 d0 00 	vmovdqu 0xd0(%rsp),%ymm5
 331:	00 00 
 333:	c4 c2 55 04 6c 1f 44 	vpmaddubsw 0x44(%r15,%rbx,1),%ymm5,%ymm5
 33a:	c5 fe 6f 74 24 70    	vmovdqu 0x70(%rsp),%ymm6
 340:	c4 c2 4d 04 74 1f 64 	vpmaddubsw 0x64(%r15,%rbx,1),%ymm6,%ymm6
 347:	c5 d5 f5 6c 24 50    	vpmaddwd 0x50(%rsp),%ymm5,%ymm5
 34d:	c5 b5 f5 f6          	vpmaddwd %ymm6,%ymm9,%ymm6
 351:	c5 d5 fe ee          	vpaddd %ymm6,%ymm5,%ymm5
 355:	c5 dd fe e5          	vpaddd %ymm5,%ymm4,%ymm4
 359:	c4 c2 2d 04 ac 1f 84 	vpmaddubsw 0x84(%r15,%rbx,1),%ymm10,%ymm5
 360:	00 00 00 
 363:	c4 c2 25 04 b4 1f a4 	vpmaddubsw 0xa4(%r15,%rbx,1),%ymm11,%ymm6
 36a:	00 00 00 
 36d:	c5 8d f5 ed          	vpmaddwd %ymm5,%ymm14,%ymm5
 371:	c5 ed f5 d6          	vpmaddwd %ymm6,%ymm2,%ymm2
 375:	c4 c2 1d 04 b4 1f c4 	vpmaddubsw 0xc4(%r15,%rbx,1),%ymm12,%ymm6
 37c:	00 00 00 
 37f:	c5 ed fe d5          	vpaddd %ymm5,%ymm2,%ymm2
 383:	c5 f5 f5 ce          	vpmaddwd %ymm6,%ymm1,%ymm1
 387:	c4 c2 15 04 ac 1f e4 	vpmaddubsw 0xe4(%r15,%rbx,1),%ymm13,%ymm5
 38e:	00 00 00 
 391:	c5 fd f5 c5          	vpmaddwd %ymm5,%ymm0,%ymm0
 395:	c5 f5 fe c0          	vpaddd %ymm0,%ymm1,%ymm0
 399:	c5 ed fe c0          	vpaddd %ymm0,%ymm2,%ymm0
 39d:	c5 fc 10 94 24 30 01 	vmovups 0x130(%rsp),%ymm2
 3a4:	00 00 
 3a6:	c5 fd fe c4          	vpaddd %ymm4,%ymm0,%ymm0
 3aa:	c4 c1 45 f5 8c 1f 04 	vpmaddwd 0x104(%r15,%rbx,1),%ymm7,%ymm1
 3b1:	01 00 00 
 3b4:	c5 f5 72 f1 05       	vpslld $0x5,%ymm1,%ymm1
 3b9:	c5 fd fa c1          	vpsubd %ymm1,%ymm0,%ymm0
 3bd:	c4 c1 62 59 0c 1f    	vmulss (%r15,%rbx,1),%xmm3,%xmm1
 3c3:	c4 e2 7d 18 c9       	vbroadcastss %xmm1,%ymm1
 3c8:	c5 fc 5b c0          	vcvtdq2ps %ymm0,%ymm0
 3cc:	c4 e2 75 b8 d0       	vfmadd231ps %ymm0,%ymm1,%ymm2
 3d1:	48 81 c3 24 01 00 00 	add    $0x124,%rbx
 3d8:	49 81 c5 d2 00 00 00 	add    $0xd2,%r13
 3df:	48 39 dd             	cmp    %rbx,%rbp
 3e2:	0f 85 88 fc ff ff    	jne    70 <q6_pair2+0x70>
 3e8:	eb 09                	jmp    3f3 <q6_pair2+0x3f3>
 3ea:	c4 41 00 57 ff       	vxorps %xmm15,%xmm15,%xmm15
 3ef:	c5 e8 57 d2          	vxorps %xmm2,%xmm2,%xmm2
 3f3:	c4 63 7d 19 f8 01    	vextractf128 $0x1,%ymm15,%xmm0
 3f9:	c5 80 58 c0          	vaddps %xmm0,%xmm15,%xmm0
 3fd:	c5 f9 c6 c8 01       	vshufpd $0x1,%xmm0,%xmm0,%xmm1
 402:	c5 f8 58 c1          	vaddps %xmm1,%xmm0,%xmm0
 406:	c5 fa 16 c8          	vmovshdup %xmm0,%xmm1
 40a:	c5 fa 58 c1          	vaddss %xmm1,%xmm0,%xmm0
 40e:	c4 c1 7a 11 06       	vmovss %xmm0,(%r14)
 413:	c4 e3 7d 19 d0 01    	vextractf128 $0x1,%ymm2,%xmm0
 419:	c5 f8 58 c2          	vaddps %xmm2,%xmm0,%xmm0
 41d:	c5 f9 c6 c8 01       	vshufpd $0x1,%xmm0,%xmm0,%xmm1
 422:	c5 f8 58 c1          	vaddps %xmm1,%xmm0,%xmm0
 426:	c5 fa 16 c8          	vmovshdup %xmm0,%xmm1
 42a:	c5 fa 58 c1          	vaddss %xmm1,%xmm0,%xmm0
 42e:	48 8b 44 24 08       	mov    0x8(%rsp),%rax
 433:	c4 c1 7a 11 04 86    	vmovss %xmm0,(%r14,%rax,4)
 439:	48 81 c4 78 01 00 00 	add    $0x178,%rsp
 440:	5b                   	pop    %rbx
 441:	41 5c                	pop    %r12
 443:	41 5d                	pop    %r13
 445:	41 5e                	pop    %r14
 447:	41 5f                	pop    %r15
 449:	5d                   	pop    %rbp
 44a:	c5 f8 77             	vzeroupper
 44d:	c3                   	ret
 44e:	bf 00 00 00 00       	mov    $0x0,%edi
 453:	be 00 00 00 00       	mov    $0x0,%esi
 458:	b9 00 00 00 00       	mov    $0x0,%ecx
 45d:	ba 0f 00 00 00       	mov    $0xf,%edx
 462:	e8 00 00 00 00       	call   467 <.LCPI0_1+0x45f>
